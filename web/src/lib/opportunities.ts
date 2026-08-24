import "server-only";

import type { Domain, Opportunity } from "@/lib/database.types";
import { isSupabaseConfigured } from "@/lib/env";
import {
  type BrowseFilters,
  DEFAULT_FILTERS,
  PAGE_SIZE,
  WINDOW_DAYS,
} from "@/lib/filters";
import { createClient } from "@/lib/supabase/server";

export interface BrowseResult {
  opportunities: Opportunity[];
  total: number;
  page: number;
  pageCount: number;
  /** False when Supabase credentials are missing, so the page can say so. */
  configured: boolean;
  error: string | null;
}

const EMPTY: BrowseResult = {
  opportunities: [],
  total: 0,
  page: 1,
  pageCount: 0,
  configured: false,
  error: null,
};

/**
 * The browse query.
 *
 * Filters combine with AND; values *within* one filter are OR, which is
 * what a multi-select means to a user ("master or doctorat, in Rabat").
 *
 * Closed listings are kept in the database — they are history, and
 * re-scraping them must not re-create them — but excluded unless asked
 * for. Listings with no deadline are never dropped by the default view:
 * rolling applications are real opportunities, so they sort last rather
 * than disappearing.
 */
export async function browseOpportunities(
  filters: BrowseFilters = DEFAULT_FILTERS,
): Promise<BrowseResult> {
  if (!isSupabaseConfigured) return EMPTY;

  const supabase = await createClient();
  let query = supabase.from("opportunities").select("*", { count: "exact" });

  if (!filters.includeClosed) {
    query = query.neq("status", "closed");
  }

  if (filters.types.length) query = query.in("type", filters.types);
  if (filters.cities.length) query = query.in("location_city", filters.cities);

  // domains is text[]: overlap, so "AI or Law" matches a listing tagged either.
  if (filters.domains.length) query = query.overlaps("domains", filters.domains);

  if (filters.within) {
    const until = new Date();
    until.setDate(until.getDate() + WINDOW_DAYS[filters.within]);
    // A deadline window is explicitly about dated listings, so rolling
    // ones are excluded here rather than silently included.
    query = query
      .not("deadline", "is", null)
      .gte("deadline", new Date().toISOString())
      .lte("deadline", until.toISOString());
  }

  if (filters.q) {
    // Matches the `french` configuration the generated column was built
    // with; websearch syntax gives users quoted phrases and -exclusions.
    query = query.textSearch("search_vector", filters.q, {
      type: "websearch",
      config: "french",
    });
  }

  switch (filters.sort) {
    case "newest":
      query = query.order("discovered_at", { ascending: false });
      break;
    case "title":
      query = query.order("title", { ascending: true });
      break;
    default:
      // Rolling listings (no deadline) sort last, not first.
      query = query.order("deadline", { ascending: true, nullsFirst: false });
  }

  const from = (filters.page - 1) * PAGE_SIZE;
  query = query.range(from, from + PAGE_SIZE - 1);

  const { data, error, count } = await query;

  if (error) {
    return { ...EMPTY, configured: true, page: filters.page, error: error.message };
  }

  const total = count ?? 0;
  return {
    opportunities: (data ?? []) as Opportunity[],
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    configured: true,
    error: null,
  };
}

export async function getOpportunity(id: string): Promise<Opportunity | null> {
  if (!isSupabaseConfigured) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return data as Opportunity;
}

/**
 * A few listings from the same institution, to fill the detail page's
 * "more from this institution" rail.
 */
export async function relatedOpportunities(
  opportunity: Opportunity,
  limit = 3,
): Promise<Opportunity[]> {
  if (!isSupabaseConfigured || !opportunity.institution) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("opportunities")
    .select("*")
    .eq("institution", opportunity.institution)
    .neq("id", opportunity.id)
    .neq("status", "closed")
    .order("deadline", { ascending: true, nullsFirst: false })
    .limit(limit);

  return (data ?? []) as Opportunity[];
}

export async function listDomains(): Promise<Domain[]> {
  if (!isSupabaseConfigured) return [];

  const supabase = await createClient();
  const { data } = await supabase.from("domains").select("*").order("sort_order");
  return (data ?? []) as Domain[];
}

export interface CityFacet {
  city: string;
  opportunity_count: number;
}

export async function listCities(): Promise<CityFacet[]> {
  if (!isSupabaseConfigured) return [];

  const supabase = await createClient();
  const { data } = await supabase.from("available_cities").select("*").limit(40);
  return (data ?? []) as CityFacet[];
}
