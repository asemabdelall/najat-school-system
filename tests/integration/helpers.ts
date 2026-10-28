import { execSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: { url: string; anon: string; service: string } | undefined;

/** Local Supabase connection details (from env, or `supabase status`). */
export function localEnv() {
  if (cached) return cached;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    cached = { url: process.env.SUPABASE_URL, anon: process.env.SUPABASE_ANON_KEY, service: process.env.SUPABASE_SERVICE_ROLE_KEY };
  } else {
    const s = JSON.parse(execSync('npx supabase status -o json', { stdio: ['ignore', 'pipe', 'ignore'] }).toString());
    cached = { url: s.API_URL, anon: s.ANON_KEY, service: s.SERVICE_ROLE_KEY };
  }
  const host = new URL(cached.url).hostname;
  if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('Integration tests only run against a local Supabase');
  return cached;
}

export const PASSWORD = process.env.DEV_SEED_PASSWORD ?? 'Najat-Dev-2026!';

export function anonClient(): SupabaseClient {
  const { url, anon } = localEnv();
  return createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function serviceClient(): SupabaseClient {
  const { url, service } = localEnv();
  return createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function signIn(email: string): Promise<SupabaseClient> {
  const c = anonClient();
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  return c;
}

export const CLASS = (g: number, s: number) => `c0000000-0000-4000-8026-000000000${g}${s}`;
export const STUDENT = (n: number) => `5e000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export function kwToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuwait' }).format(new Date());
}
export function isSchoolDay(iso: string) {
  return ![5, 6].includes(new Date(`${iso}T00:00:00Z`).getUTCDay());
}
