import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

// Check if credentials are valid instead of placeholder strings
export function isValidSupabaseConfig(url: string, key: string): boolean {
  if (!url || !key) return false;
  const cleanUrl = url.trim().toLowerCase();
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

// Export the singleton supabase instance
export const supabase = isValidSupabaseConfig(supabaseUrl, supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
