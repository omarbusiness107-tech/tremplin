import type { OpportunityType } from "@/lib/database.types";

/**
 * Browse state lives in the URL, not in React state.
 *
 * That makes every filtered view shareable and bookmarkable, survives a
 * reload, and lets the grid stay a Server Component — the page re-renders
 * from searchParams rather than fetching on the client.
 */

export const OPPORTUNITY_TYPES: OpportunityType[] = [
  "job",
  "internship",
  "bachelor",
  "master",
  "doctorat",
  "scholarship",
  "concours",
];

export const SORT_KEYS = ["deadline", "newest", "title"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const SORT_LABELS: Record<SortKey, string> = {
  deadline: "Deadline — soonest first",
  newest: "Recently added",
  title: "Alphabetical",
};

export const DEADLINE_WINDOWS = ["7d", "30d", "90d"] as const;
export type DeadlineWindow = (typeof DEADLINE_WINDOWS)[number];

export const DEADLINE_WINDOW_LABELS: Record<DeadlineWindow, string> = {
  "7d": "Closing this week",
  "30d": "Within 30 days",
  "90d": "Within 3 months",
};

export const WINDOW_DAYS: Record<DeadlineWindow, number> = { "7d": 7, "30d": 30, "90d": 90 };

export const PAGE_SIZE = 24;

export interface BrowseFilters {
  q: string;
  types: OpportunityType[];
  domains: string[];
  cities: string[];
  within: DeadlineWindow | null;
  includeClosed: boolean;
  sort: SortKey;
  page: number;
}

export const DEFAULT_FILTERS: BrowseFilters = {
  q: "",
  types: [],
  domains: [],
  cities: [],
  within: null,
  includeClosed: false,
  sort: "deadline",
  page: 1,
};

export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Accepts both `?type=job&type=master` and `?type=job,master`. */
function readList(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  const parts = (Array.isArray(value) ? value : [value]).flatMap((v) => v.split(","));
  return [...new Set(parts.map((p) => p.trim()).filter(Boolean))];
}

function readOne(value: string | string[] | undefined): string {
  if (value === undefined) return "";
  return (Array.isArray(value) ? value[0] : value).trim();
}

export function parseFilters(params: RawSearchParams): BrowseFilters {
  const types = readList(params.type).filter((t): t is OpportunityType =>
    (OPPORTUNITY_TYPES as string[]).includes(t),
  );

  const within = DEADLINE_WINDOWS.find((w) => w === readOne(params.within)) ?? null;
  const sort = SORT_KEYS.find((s) => s === readOne(params.sort)) ?? DEFAULT_FILTERS.sort;

  const page = Number.parseInt(readOne(params.page), 10);

  return {
    q: readOne(params.q),
    types,
    domains: readList(params.domain),
    cities: readList(params.city),
    within,
    includeClosed: readOne(params.closed) === "1",
    sort,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/**
 * Serialize back to a query string, omitting anything left at its default
 * so a shared link carries only what the user actually chose.
 */
export function toSearchParams(filters: BrowseFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.q) params.set("q", filters.q);
  if (filters.types.length) params.set("type", filters.types.join(","));
  if (filters.domains.length) params.set("domain", filters.domains.join(","));
  if (filters.cities.length) params.set("city", filters.cities.join(","));
  if (filters.within) params.set("within", filters.within);
  if (filters.includeClosed) params.set("closed", "1");
  if (filters.sort !== DEFAULT_FILTERS.sort) params.set("sort", filters.sort);
  if (filters.page > 1) params.set("page", String(filters.page));

  return params;
}

export function filtersToHref(filters: BrowseFilters, pathname = "/"): string {
  const query = toSearchParams(filters).toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** True when nothing is narrowing the list. */
export function isUnfiltered(filters: BrowseFilters): boolean {
  return (
    !filters.q &&
    !filters.types.length &&
    !filters.domains.length &&
    !filters.cities.length &&
    !filters.within &&
    !filters.includeClosed
  );
}

export function countActiveFilters(filters: BrowseFilters): number {
  return (
    (filters.q ? 1 : 0) +
    filters.types.length +
    filters.domains.length +
    filters.cities.length +
    (filters.within ? 1 : 0) +
    (filters.includeClosed ? 1 : 0)
  );
}

/**
 * Toggle one value in a multi-select filter.
 *
 * Always resets to page 1: staying on page 7 after narrowing the results
 * usually lands the user on an empty page.
 */
export function toggleValue<K extends "types" | "domains" | "cities">(
  filters: BrowseFilters,
  key: K,
  value: BrowseFilters[K][number],
): BrowseFilters {
  const current = filters[key] as string[];
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
  return { ...filters, [key]: next, page: 1 } as BrowseFilters;
}
