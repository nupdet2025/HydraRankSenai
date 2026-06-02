import fs from 'fs/promises';
import path from 'path';

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

// Memory cache
let dbCache: DatabaseSchema = {
  users: {},
  logs: [],
  verificationCodes: {},
  sessions: {},
};

let isLoaded = false;

// Load DB from file
async function loadDb() {
  if (isLoaded) return;
  try {
    const data = await fs.readFile(DB_FILE, 'utf-8');
    dbCache = JSON.parse(data);
    isLoaded = true;
  } catch (error) {
    // If file doesn't exist, use default cache and write it
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

// Save DB to file
async function saveDb() {
  try {
    await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
    await fs.writeFile(DB_FILE, JSON.stringify(dbCache, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save database.json:', error);
  }
}

export async function getUserByEmail(email: string): Promise<UserProfile | null> {
  await loadDb();
  const normalized = email.toLowerCase().trim();
  return dbCache.users[normalized] || null;
}

export async function saveUser(profile: UserProfile): Promise<UserProfile> {
  await loadDb();
  const normalized = profile.email.toLowerCase().trim();
  const updated = { ...profile, email: normalized };
  dbCache.users[normalized] = updated;
  await saveDb();
  return updated;
}

export async function addWaterLog(email: string, date: string, amount: number): Promise<WaterLog> {
  await loadDb();
  const normalizedEmail = email.toLowerCase().trim();
  const id = `${normalizedEmail}_${date}_${Date.now()}`;
  const newLog: WaterLog = {
    id,
    email: normalizedEmail,
    date,
    amount,
    timestamp: new Date().toISOString(),
  };
  dbCache.logs.push(newLog);
  await saveDb();
  return newLog;
}

export async function deleteWaterLog(logId: string, email: string): Promise<boolean> {
  await loadDb();
  const normalizedEmail = email.toLowerCase().trim();
  const index = dbCache.logs.findIndex((l) => l.id === logId && l.email === normalizedEmail);
  if (index !== -1) {
    dbCache.logs.splice(index, 1);
    await saveDb();
    return true;
  }
  return false;
}

export async function getUserLogs(email: string): Promise<WaterLog[]> {
  await loadDb();
  const normalized = email.toLowerCase().trim();
  return dbCache.logs.filter((l) => l.email === normalized);
}

export async function getDailySummaryByDate(date: string): Promise<Record<string, number>> {
  await loadDb();
  // Sum up water intake for each email for the given date
  const summary: Record<string, number> = {};
  for (const log of dbCache.logs) {
    if (log.date === date) {
      const email = log.email;
      summary[email] = (summary[email] || 0) + log.amount;
    }
  }
  return summary;
}

export async function getPeriodSummary(startDate: string, endDate: string): Promise<Record<string, number>> {
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

export async function createVerificationCode(email: string, code: string): Promise<VerificationCode> {
  await loadDb();
  const normalized = email.toLowerCase().trim();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 mins
  const record: VerificationCode = {
    email: normalized,
    code,
    expiresAt,
  };
  dbCache.verificationCodes[normalized] = record;
  await saveDb();
  return record;
}

export async function verifyVerificationCode(email: string, code: string): Promise<boolean> {
  await loadDb();
  const normalized = email.toLowerCase().trim();
  const record = dbCache.verificationCodes[normalized];
  if (!record) return false;

  const isExpired = new Date(record.expiresAt).getTime() < Date.now();
  if (isExpired) {
    delete dbCache.verificationCodes[normalized];
    await saveDb();
    return false;
  }

  if (record.code === code) {
    // Consume the code
    delete dbCache.verificationCodes[normalized];
    await saveDb();
    return true;
  }

  return false;
}

export async function createSession(email: string): Promise<UserSession> {
  await loadDb();
  const normalized = email.toLowerCase().trim();
  const token = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
  const session: UserSession = {
    token,
    email: normalized,
    expiresAt,
  };
  dbCache.sessions[token] = session;
  await saveDb();
  return session;
}

export async function getSession(token: string): Promise<UserSession | null> {
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

export async function deleteSession(token: string): Promise<void> {
  await loadDb();
  if (dbCache.sessions[token]) {
    delete dbCache.sessions[token];
    await saveDb();
  }
}

export async function getAllUsers(): Promise<Record<string, UserProfile>> {
  await loadDb();
  return dbCache.users;
}
