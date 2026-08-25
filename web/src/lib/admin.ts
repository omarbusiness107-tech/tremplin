import "server-only";

import type { ScraperRun, SourceHealth } from "@/lib/database.types";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Monitoring data for the admin page.
 *
 * Read with the caller's own session, not a service key: `scraper_runs`
 * has an admin-only RLS policy, so a non-admin who guesses the URL gets
 * empty lists from the database itself rather than relying on the page
 * to remember to check.
 */
export async function getSourceHealth(): Promise<SourceHealth[]> {
  if (!isSupabaseConfigured) return [];

  const supabase = await createClient();
  const { data } = await supabase.from("source_health").select("*").order("source_key");
  return data ?? [];
}

export async function getRecentRuns(limit = 25): Promise<ScraperRun[]> {
  if (!isSupabaseConfigured) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("scraper_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}
