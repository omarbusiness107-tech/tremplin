import "server-only";

import type { Domain, Opportunity } from "@/lib/database.types";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const DEFAULT_PAGE_SIZE = 24;

export interface BrowseResult {
  opportunities: Opportunity[];
  total: number;
  /** False when Supabase credentials are missing, so the page can say so. */
  configured: boolean;
  error: string | null;
}

/**
 * Open opportunities, soonest deadline first.
 *
 * Closed listings are kept in the database (they are useful history, and
 * re-scraping them must not re-create them) but excluded from browsing.
 * Rows with no deadline sort last rather than being dropped: rolling
 * applications are real opportunities.
 */
export async function browseOpportunities({
  limit = DEFAULT_PAGE_SIZE,
}: { limit?: number } = {}): Promise<BrowseResult> {
  if (!isSupabaseConfigured) {
    return { opportunities: [], total: 0, configured: false, error: null };
  }

  const supabase = await createClient();
  const { data, error, count } = await supabase
    .from("opportunities")
    .select("*", { count: "exact" })
    .neq("status", "closed")
    .order("deadline", { ascending: true, nullsFirst: false })
    .limit(limit);

  if (error) {
    return { opportunities: [], total: 0, configured: true, error: error.message };
  }

  return {
    opportunities: (data ?? []) as Opportunity[],
    total: count ?? 0,
    configured: true,
    error: null,
  };
}

export async function listDomains(): Promise<Domain[]> {
  if (!isSupabaseConfigured) return [];

  const supabase = await createClient();
  const { data } = await supabase.from("domains").select("*").order("sort_order");
  return (data ?? []) as Domain[];
}
