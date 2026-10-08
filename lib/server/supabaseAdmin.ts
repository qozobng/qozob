// =========================================================================
// SERVER-ONLY Supabase client with the service-role key.
// Bypasses Row Level Security, so it must only ever be imported from API routes
// (app/api/**) — never from a "use client" file. The key has no NEXT_PUBLIC_ prefix,
// so it is never sent to browsers.
// =========================================================================
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export class ConfigError extends Error {}

export function supabaseAdmin(): SupabaseClient {
  if (typeof window !== 'undefined') throw new Error('supabaseAdmin() must not run in the browser');
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new ConfigError('Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it in Vercel → Project → Settings → Environment Variables.');
  }
  cached = createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}

