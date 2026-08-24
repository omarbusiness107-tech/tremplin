import "server-only";

import type { User } from "@supabase/supabase-js";

import type { Profile, UserPreferences } from "@/lib/database.types";

/** What the app actually reads off a profile; timestamps are unused. */
export type ProfileSummary = Pick<
  Profile,
  "id" | "email" | "full_name" | "avatar_url" | "is_admin"
>;
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in user, or null.
 *
 * getUser() rather than getSession(): the session cookie is user-supplied,
 * and only getUser() checks it against the auth server.
 */
export async function getCurrentUser(): Promise<User | null> {
  if (!isSupabaseConfigured) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getProfile(): Promise<ProfileSummary | null> {
  if (!isSupabaseConfigured) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  // RLS means this can only ever be the caller's own row.
  return data ?? null;
}

export async function getPreferences(): Promise<UserPreferences | null> {
  if (!isSupabaseConfigured) return null;

  const supabase = await createClient();
  const { data } = await supabase.from("user_preferences").select("*").maybeSingle();
  return data ?? null;
}
