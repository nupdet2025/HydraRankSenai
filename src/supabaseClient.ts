import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

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

// Check if credentials are valid instead of placeholder strings
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

const sanitizedUrl = sanitizeSupabaseUrl(supabaseUrl);

// Export the singleton supabase instance
export const supabase = isValidSupabaseConfig(supabaseUrl, supabaseAnonKey)
  ? createClient(sanitizedUrl, supabaseAnonKey)
  : null;
