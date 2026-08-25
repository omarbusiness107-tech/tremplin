/**
 * Supabase credentials, read once.
 *
 * `isSupabaseConfigured` lets pages render a setup hint instead of
 * throwing on a fresh clone with no .env.local yet.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
