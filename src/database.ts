import { createClient } from '@supabase/supabase-js';
import { UserProfile, WaterLog } from './types';

// Interfaces for local database fallback
interface LocalDB {
  profiles: Record<string, UserProfile>;
  logs: WaterLog[];
}

const LOCAL_DB_KEY = 'hydrarank_local_db';

// Get local DB helper
function getLocalDB(): LocalDB {
  try {
    const raw = localStorage.getItem(LOCAL_DB_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error parsing local database, resetting...', e);
  }
  const defaultDB: LocalDB = { profiles: {}, logs: [] };
  localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(defaultDB));
  return defaultDB;
}

// Save local DB helper
function saveLocalDB(db: LocalDB) {
  try {
    localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(db));
  } catch (e) {
    console.error('Error saving local database', e);
  }
}

// Check and fetch Supabase configurations
export function getSupabaseConfig() {
  // 1. Check environment variables (Vite-style)
  const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
  const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

  // 2. Check localStorage custom configuration
  const localUrl = localStorage.getItem('custom_supabase_url') || '';
  const localKey = localStorage.getItem('custom_supabase_anon_key') || '';

  return {
    url: envUrl || localUrl,
    key: envKey || localKey,
    source: envUrl ? 'env' : (localUrl ? 'user' : 'none'),
  };
}

export function isSupabaseActive(): boolean {
  const { url, key } = getSupabaseConfig();
  return !!(url && key);
}

// Lazy Supabase client creation
let supabaseCached: any = null;
let currentConfigHash = '';

function getSupabase() {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    return null;
  }
  
  const hash = `${url}_${key}`;
  if (!supabaseCached || currentConfigHash !== hash) {
    supabaseCached = createClient(url, key);
    currentConfigHash = hash;
  }
  return supabaseCached;
}

// --- Save Custom Configuration ---
export function saveCustomSupabaseConfig(url: string, key: string) {
  if (url && key) {
    localStorage.setItem('custom_supabase_url', url.trim());
    localStorage.setItem('custom_supabase_anon_key', key.trim());
    supabaseCached = null; // force re-initialization
  } else {
    localStorage.removeItem('custom_supabase_url');
    localStorage.removeItem('custom_supabase_anon_key');
    supabaseCached = null;
  }
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

// --- Unified Direct Client Database Methods ---

export async function getUserByEmail(email: string): Promise<UserProfile | null> {
  const normalized = email.toLowerCase().trim();
  const supabase = getSupabase();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', normalized)
        .maybeSingle();

      if (error) throw error;
      return mapProfile(data);
    } catch (err: any) {
      console.error('[Supabase Error] getUserByEmail:', err);
      throw new Error(`Erro ao buscar usuário no Supabase: ${err.message || err}`);
    }
  } else {
    // Falls back to localStorage
    const db = getLocalDB();
    return db.profiles[normalized] || null;
  }
}

export async function saveUser(profile: UserProfile): Promise<UserProfile> {
  const normalized = profile.email.toLowerCase().trim();
  const updatedProfile = { ...profile, email: normalized };
  const supabase = getSupabase();

  if (supabase) {
    try {
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
    } catch (err: any) {
      console.error('[Supabase Error] saveUser:', err);
      throw new Error(`Erro ao salvar perfil no Supabase: ${err.message || err}`);
    }
  } else {
    const db = getLocalDB();
    db.profiles[normalized] = updatedProfile;
    saveLocalDB(db);
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
  const supabase = getSupabase();

  if (supabase) {
    try {
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
    } catch (err: any) {
      console.error('[Supabase Error] addWaterLog:', err);
      throw new Error(`Erro ao salvar consumo no Supabase: ${err.message || err}`);
    }
  } else {
    const db = getLocalDB();
    db.logs.push(newLog);
    saveLocalDB(db);
    return newLog;
  }
}

export async function deleteWaterLog(logId: string, email: string): Promise<boolean> {
  const normalizedEmail = email.toLowerCase().trim();
  const supabase = getSupabase();

  if (supabase) {
    try {
      const { error, status } = await supabase
        .from('water_logs')
        .delete()
        .eq('id', logId)
        .eq('email', normalizedEmail);

      if (error) throw error;
      return status >= 200 && status < 300;
    } catch (err: any) {
      console.error('[Supabase Error] deleteWaterLog:', err);
      throw new Error(`Erro ao remover consumo do Supabase: ${err.message || err}`);
    }
  } else {
    const db = getLocalDB();
    const index = db.logs.findIndex((l) => l.id === logId && l.email === normalizedEmail);
    if (index !== -1) {
      db.logs.splice(index, 1);
      saveLocalDB(db);
      return true;
    }
    return false;
  }
}

export async function getUserLogs(email: string): Promise<WaterLog[]> {
  const normalized = email.toLowerCase().trim();
  const supabase = getSupabase();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('water_logs')
        .select('*')
        .eq('email', normalized);

      if (error) throw error;
      return (data || []).map(mapLog);
    } catch (err: any) {
      console.error('[Supabase Error] getUserLogs:', err);
      throw new Error(`Erro ao buscar histórico no Supabase: ${err.message || err}`);
    }
  } else {
    const db = getLocalDB();
    return db.logs.filter((l) => l.email === normalized);
  }
}

export async function deleteUserProfile(email: string): Promise<boolean> {
  const normalized = email.toLowerCase().trim();
  const supabase = getSupabase();

  if (supabase) {
    try {
      // Direct cascades on standard schema, but let's delete them for safety
      await supabase.from('water_logs').delete().eq('email', normalized);
      
      const { error, status } = await supabase
        .from('profiles')
        .delete()
        .eq('email', normalized);

      if (error) throw error;
      return status >= 200 && status < 300;
    } catch (err: any) {
      console.error('[Supabase Error] deleteUserProfile:', err);
      throw new Error(`Erro ao deletar perfil do Supabase: ${err.message || err}`);
    }
  } else {
    const db = getLocalDB();
    if (db.profiles[normalized]) {
      delete db.profiles[normalized];
      db.logs = db.logs.filter((l) => l.email !== normalized);
      saveLocalDB(db);
      return true;
    }
    return false;
  }
}

export async function getAllUsers(): Promise<Record<string, UserProfile>> {
  const supabase = getSupabase();

  if (supabase) {
    try {
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
    } catch (err: any) {
      console.error('[Supabase Error] getAllUsers:', err);
      throw new Error(`Erro ao buscar ranking no Supabase: ${err.message || err}`);
    }
  } else {
    const db = getLocalDB();
    return db.profiles;
  }
}

export async function getDailySummaryByDate(date: string): Promise<Record<string, number>> {
  const supabase = getSupabase();

  if (supabase) {
    try {
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
    } catch (err: any) {
      console.error('[Supabase Error] getDailySummaryByDate:', err);
      throw new Error(`Erro ao carregar soma diária: ${err.message || err}`);
    }
  } else {
    const db = getLocalDB();
    const summary: Record<string, number> = {};
    for (const log of db.logs) {
      if (log.date === date) {
        summary[log.email] = (summary[log.email] || 0) + log.amount;
      }
    }
    return summary;
  }
}

export async function getPeriodSummary(startDate: string, endDate: string): Promise<Record<string, number>> {
  const supabase = getSupabase();

  if (supabase) {
    try {
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
    } catch (err: any) {
      console.error('[Supabase Error] getPeriodSummary:', err);
      throw new Error(`Erro ao carregar soma por período: ${err.message || err}`);
    }
  } else {
    const db = getLocalDB();
    const summary: Record<string, number> = {};
    for (const log of db.logs) {
      if (log.date >= startDate && log.date <= endDate) {
        summary[log.email] = (summary[log.email] || 0) + log.amount;
      }
    }
    return summary;
  }
}
