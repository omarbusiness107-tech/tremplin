import "server-only";

import type { Opportunity } from "@/lib/database.types";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export interface SavedOpportunity {
  opportunity: Opportunity;
  savedAt: string;
}

/**
 * The signed-in user's bookmarks, soonest deadline first.
 *
 * Closed listings are kept: someone who saved something and missed it
 * should see that it closed rather than have it vanish.
 */
export async function listBookmarks(): Promise<SavedOpportunity[]> {
  if (!isSupabaseConfigured) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("bookmarks")
    .select("created_at, opportunities(*)")
    .order("created_at", { ascending: false });

  if (!data) return [];

  return data
    .flatMap((row) => {
      const opportunity = row.opportunities as unknown as Opportunity | null;
      return opportunity ? [{ opportunity, savedAt: row.created_at }] : [];
    })
    .sort((a, b) => deadlineOrder(a.opportunity) - deadlineOrder(b.opportunity));
}

/** Which of these opportunity ids the current user has saved. */
export async function bookmarkedIds(ids: string[]): Promise<Set<string>> {
  if (!isSupabaseConfigured || ids.length === 0) return new Set();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Set();

  const { data } = await supabase
    .from("bookmarks")
    .select("opportunity_id")
    .in("opportunity_id", ids);

  return new Set((data ?? []).map((row) => row.opportunity_id));
}

/** Rolling listings (no deadline) sort last. */
function deadlineOrder(opportunity: Opportunity): number {
  if (!opportunity.deadline) return Number.MAX_SAFE_INTEGER;
  return new Date(opportunity.deadline).getTime();
}
