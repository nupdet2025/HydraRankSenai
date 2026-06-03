import fs from 'fs/promises';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

export interface UserProfile {
  email: string;
  username: string;
  avatar: string; // Emoji character or sticker string
  createdAt: string;
}

export interface WaterLog {
  id: string;
  email: string;
  date: string; // YYYY-MM-DD
  amount: number; // in milliliters (ml)
  timestamp: string;
}

export interface VerificationCode {
  email: string;
  code: string;
  expiresAt: string;
}

export interface UserSession {
  token: string;
  email: string;
  expiresAt: string;
}

interface DatabaseSchema {
  users: Record<string, UserProfile>; // email -> profile
  logs: WaterLog[];
  verificationCodes: Record<string, VerificationCode>; // email -> info
  sessions: Record<string, UserSession>; // token -> info
}

const DB_FILE = path.join(process.cwd(), 'database.json');

// --- Memory cache fallback ---
let dbCache: DatabaseSchema = {
  users: {},
  logs: [],
  verificationCodes: {},
  sessions: {},
};

let isLoaded = false;

async function loadDb() {
  if (isLoaded) return;
  try {
    const data = await fs.readFile(DB_FILE, 'utf-8');
    dbCache = JSON.parse(data);
    isLoaded = true;
  } catch (error) {
    dbCache = {
      users: {},
      logs: [],
      verificationCodes: {},
      sessions: {},
    };
    isLoaded = true;
    await saveDb();
  }
}

async function saveDb() {
  try {
    await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
    await fs.writeFile(DB_FILE, JSON.stringify(dbCache, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save database.json:', error);
  }
}

// --- Supabase Client Laziness ---
let supabaseClient: any = null;

export function sanitizeSupabaseUrl(url: string): string {
  if (!url) return '';
  let clean = url.trim();
  // Remove slash at the end if present
  while (clean.endsWith('/')) {
    clean = clean.slice(0, -1);
  }
  // Check if it ends with /rest/v1 (case-insensitive)
  if (clean.toLowerCase().endsWith('/rest/v1')) {
    clean = clean.slice(0, -8);
  }
  // Clean trailing slashes again just in case
  while (clean.endsWith('/')) {
    clean = clean.slice(0, -1);
  }
  return clean;
}

export function isValidSupabaseConfig(url: string, key: string): boolean {
  if (!url || !key) return false;
  const sanitizedUrl = sanitizeSupabaseUrl(url);
  const cleanUrl = sanitizedUrl.trim().toLowerCase();
  const cleanKey = key.trim().toLowerCase();
  
  if (
    cleanUrl.includes('your-supabase-project-url') ||
    cleanUrl.includes('placeholder') ||
    cleanUrl.includes('example.com') ||
    !cleanUrl.startsWith('http')
  ) {
    return false;
  }
  
  if (
    cleanKey.includes('your-supabase-anon-key') ||
    cleanKey.includes('placeholder') ||
    cleanKey.length < 20
  ) {
    return false;
  }
  
  return true;
}

export function isSupabaseActive(): boolean {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  return isValidSupabaseConfig(url, key);
}

function getSupabase() {
  if (!supabaseClient) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error('Supabase client is not configured.');
    }
    const sanitizedUrl = sanitizeSupabaseUrl(url);
    supabaseClient = createClient(sanitizedUrl, key);
  }
  return supabaseClient;
}

// --- Error Interceptor Helper ---
function handleSupabaseError(actionName: string, err: any): never {
  console.error(`[Supabase Error] ${actionName}:`, err);
  const code = err?.code || '';
  const message = err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
  
  if (code === '42P01' || (message.includes('relation') && message.includes('does not exist'))) {
    throw new Error(
      `Tabelas não configuradas no Supabase! Por favor, acesse o painel de controle do Supabase, vá na área "SQL Editor", crie uma nova query, copie as instruções contidas no arquivo "supabase_schema.sql" na raiz do projeto, cole e clique em "Run".`
    );
  }
  
  if (code === 'P0001' || code === '28P01' || message.includes('invalid api key') || message.includes('Invalid API key') || message.includes('JWT')) {
    throw new Error(
      `Falha de autenticação do Supabase. Verifique se as variáveis SUPABASE_URL e SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY foram salvas corretamente para o seu projeto.`
    );
  }

  throw new Error(`Erro no Supabase (${actionName}): ${message}`);
}

// --- Mapping Utils ---
function mapProfile(row: any): UserProfile | null {
  if (!row) return null;
  return {
    email: row.email,
    username: row.username,
    avatar: row.avatar,
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
  };
}

function mapLog(row: any): WaterLog {
  return {
    id: row.id,
    email: row.email,
    date: row.date,
    amount: row.amount,
    timestamp: row.timestamp || row.created_at || new Date().toISOString(),
  };
}

// --- Unified Database Interface ---

export async function getUserByEmail(email: string): Promise<UserProfile | null> {
  const normalized = email.toLowerCase().trim();
  if (isSupabaseActive()) {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', normalized)
        .maybeSingle();

      if (error) throw error;
      return mapProfile(data);
    } catch (err) {
      handleSupabaseError('getUserByEmail', err);
    }
  } else {
    await loadDb();
    return dbCache.users[normalized] || null;
  }
}

export async function saveUser(profile: UserProfile): Promise<UserProfile> {
  const normalized = profile.email.toLowerCase().trim();
  const updatedProfile = { ...profile, email: normalized };

  if (isSupabaseActive()) {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('profiles')
        .upsert({
          email: normalized,
          username: profile.username,
          avatar: profile.avatar,
          created_at: profile.createdAt || new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return mapProfile(data) || updatedProfile;
    } catch (err) {
      handleSupabaseError('saveUser', err);
    }
  } else {
    await loadDb();
    dbCache.users[normalized] = updatedProfile;
    await saveDb();
    return updatedProfile;
  }
}

export async function addWaterLog(email: string, date: string, amount: number): Promise<WaterLog> {
  const normalizedEmail = email.toLowerCase().trim();
  const id = `${normalizedEmail}_${date}_${Date.now()}`;
  const timestamp = new Date().toISOString();

  const newLog: WaterLog = {
    id,
    email: normalizedEmail,
    date,
    amount,
    timestamp,
  };

  if (isSupabaseActive()) {
    try {
      const supabase = getSupabase();
      const { error } = await supabase
        .from('water_logs')
        .insert({
          id,
          email: normalizedEmail,
          date,
          amount,
          timestamp,
        });

      if (error) throw error;
      return newLog;
    } catch (err) {
      handleSupabaseError('addWaterLog', err);
    }
  } else {
    await loadDb();
    dbCache.logs.push(newLog);
    await saveDb();
    return newLog;
  }
}

export async function deleteWaterLog(logId: string, email: string): Promise<boolean> {
  const normalizedEmail = email.toLowerCase().trim();

  if (isSupabaseActive()) {
    try {
      const supabase = getSupabase();
      const { error, count } = await supabase
        .from('water_logs')
        .delete({ count: 'exact' })
        .eq('id', logId)
        .eq('email', normalizedEmail);

      if (error) throw error;
      return count !== null && count > 0;
    } catch (err) {
      handleSupabaseError('deleteWaterLog', err);
    }
  } else {
    await loadDb();
    const index = dbCache.logs.findIndex((l) => l.id === logId && l.email === normalizedEmail);
    if (index !== -1) {
      dbCache.logs.splice(index, 1);
      await saveDb();
      return true;
    }
    return false;
  }
}

export async function getUserLogs(email: string): Promise<WaterLog[]> {
  const normalized = email.toLowerCase().trim();

  if (isSupabaseActive()) {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('water_logs')
        .select('*')
        .eq('email', normalized);

      if (error) throw error;
      return (data || []).map(mapLog);
    } catch (err) {
      handleSupabaseError('getUserLogs', err);
    }
  } else {
    await loadDb();
    return dbCache.logs.filter((l) => l.email === normalized);
  }
}

export async function getDailySummaryByDate(date: string): Promise<Record<string, number>> {
  if (isSupabaseActive()) {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('water_logs')
        .select('email, amount')
        .eq('date', date);

      if (error) throw error;
      const summary: Record<string, number> = {};
      if (data) {
        for (const log of data) {
          summary[log.email] = (summary[log.email] || 0) + log.amount;
        }
      }
      return summary;
    } catch (err) {
      handleSupabaseError('getDailySummaryByDate', err);
    }
  } else {
    await loadDb();
    const summary: Record<string, number> = {};
    for (const log of dbCache.logs) {
      if (log.date === date) {
        const email = log.email;
        summary[email] = (summary[email] || 0) + log.amount;
      }
    }
    return summary;
  }
}

export async function getPeriodSummary(startDate: string, endDate: string): Promise<Record<string, number>> {
  if (isSupabaseActive()) {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('water_logs')
        .select('email, amount')
        .gte('date', startDate)
        .lte('date', endDate);

      if (error) throw error;
      const summary: Record<string, number> = {};
      if (data) {
        for (const log of data) {
          summary[log.email] = (summary[log.email] || 0) + log.amount;
        }
      }
      return summary;
    } catch (err) {
      handleSupabaseError('getPeriodSummary', err);
    }
  } else {
    await loadDb();
    const summary: Record<string, number> = {};
    for (const log of dbCache.logs) {
      if (log.date >= startDate && log.date <= endDate) {
        const email = log.email;
        summary[email] = (summary[email] || 0) + log.amount;
      }
    }
    return summary;
  }
}

export async function createVerificationCode(email: string, code: string): Promise<VerificationCode> {
  const normalized = email.toLowerCase().trim();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 mins

  const record: VerificationCode = {
    email: normalized,
    code,
    expiresAt,
  };

  if (isSupabaseActive()) {
    try {
      const supabase = getSupabase();
      const { error } = await supabase
        .from('verification_codes')
        .upsert({
          email: normalized,
          code,
          expires_at: expiresAt,
        });

      if (error) throw error;
      return record;
    } catch (err) {
      handleSupabaseError('createVerificationCode', err);
    }
  } else {
    await loadDb();
    dbCache.verificationCodes[normalized] = record;
    await saveDb();
    return record;
  }
}

export async function verifyVerificationCode(email: string, code: string): Promise<boolean> {
  const normalized = email.toLowerCase().trim();

  if (isSupabaseActive()) {
    try {
      const supabase = getSupabase();
      const { data: record, error } = await supabase
        .from('verification_codes')
        .select('*')
        .eq('email', normalized)
        .maybeSingle();

      if (error || !record) return false;

      const isExpired = new Date(record.expires_at).getTime() < Date.now();
      if (isExpired) {
        await supabase.from('verification_codes').delete().eq('email', normalized);
        return false;
      }

      if (record.code === code) {
        await supabase.from('verification_codes').delete().eq('email', normalized);
        return true;
      }
      return false;
    } catch (err) {
      return handleSupabaseError('verifyVerificationCode', err);
    }
  } else {
    await loadDb();
    const record = dbCache.verificationCodes[normalized];
    if (!record) return false;

    const isExpired = new Date(record.expiresAt).getTime() < Date.now();
    if (isExpired) {
      delete dbCache.verificationCodes[normalized];
      await saveDb();
      return false;
    }

    if (record.code === code) {
      delete dbCache.verificationCodes[normalized];
      await saveDb();
      return true;
    }
    return false;
  }
}

export async function createSession(email: string): Promise<UserSession> {
  const normalized = email.toLowerCase().trim();
  const token = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

  const session: UserSession = {
    token,
    email: normalized,
    expiresAt,
  };

  if (isSupabaseActive()) {
    try {
      const supabase = getSupabase();
      const { error } = await supabase
        .from('sessions')
        .insert({
          token,
          email: normalized,
          expires_at: expiresAt,
        });

      if (error) throw error;
      return session;
    } catch (err) {
      handleSupabaseError('createSession', err);
    }
  } else {
    await loadDb();
    dbCache.sessions[token] = session;
    await saveDb();
    return session;
  }
}

export async function getSession(token: string): Promise<UserSession | null> {
  if (isSupabaseActive()) {
    try {
      const supabase = getSupabase();
      const { data: session, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('token', token)
        .maybeSingle();

      if (error || !session) return null;

      const isExpired = new Date(session.expires_at).getTime() < Date.now();
      if (isExpired) {
        await supabase.from('sessions').delete().eq('token', token);
        return null;
      }

      return {
        token: session.token,
        email: session.email,
        expiresAt: session.expires_at,
      };
    } catch (err) {
      return handleSupabaseError('getSession', err);
    }
  } else {
    await loadDb();
    const session = dbCache.sessions[token];
    if (!session) return null;

    const isExpired = new Date(session.expiresAt).getTime() < Date.now();
    if (isExpired) {
      delete dbCache.sessions[token];
      await saveDb();
      return null;
    }

    return session;
  }
}

export async function deleteSession(token: string): Promise<void> {
  if (isSupabaseActive()) {
    try {
      const supabase = getSupabase();
      await supabase.from('sessions').delete().eq('token', token);
    } catch (err) {
      console.error('[Supabase Error] deleteSession:', err);
    }
  } else {
    await loadDb();
    if (dbCache.sessions[token]) {
      delete dbCache.sessions[token];
      await saveDb();
    }
  }
}

export async function deleteUserProfile(email: string): Promise<boolean> {
  const normalized = email.toLowerCase().trim();

  if (isSupabaseActive()) {
    try {
      const supabase = getSupabase();
      // Delete verification codes
      await supabase.from('verification_codes').delete().eq('email', normalized);
      // Delete active sessions
      await supabase.from('sessions').delete().eq('email', normalized);
      // Delete water logs
      await supabase.from('water_logs').delete().eq('email', normalized);
      // Delete profile
      const { error, count } = await supabase
        .from('profiles')
        .delete({ count: 'exact' })
        .eq('email', normalized);

      if (error) throw error;
      return count !== null && count > 0;
    } catch (err) {
      handleSupabaseError('deleteUserProfile', err);
    }
  } else {
    await loadDb();
    if (dbCache.users[normalized]) {
      delete dbCache.users[normalized];
      dbCache.logs = dbCache.logs.filter((l) => l.email !== normalized);
      for (const token of Object.keys(dbCache.sessions)) {
        if (dbCache.sessions[token].email === normalized) {
          delete dbCache.sessions[token];
        }
      }
      if (dbCache.verificationCodes[normalized]) {
        delete dbCache.verificationCodes[normalized];
      }
      await saveDb();
      return true;
    }
    return false;
  }
}

export async function getAllUsers(): Promise<Record<string, UserProfile>> {
  if (isSupabaseActive()) {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('profiles')
        .select('*');

      if (error) throw error;
      const users: Record<string, UserProfile> = {};
      if (data) {
        for (const row of data) {
          const profile = mapProfile(row);
          if (profile) {
            users[profile.email] = profile;
          }
        }
      }
      return users;
    } catch (err) {
      handleSupabaseError('getAllUsers', err);
    }
  } else {
    await loadDb();
    return dbCache.users;
  }
}
