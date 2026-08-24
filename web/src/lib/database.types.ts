/**
 * Types for the tables in supabase/migrations/.
 *
 * Kept by hand for now so the app has types before a Supabase project
 * exists. Once one does, regenerate instead of editing:
 *
 *   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
 *
 * Row shapes must stay `type` aliases, never `interface`. postgrest-js
 * requires each table to extend Record<string, unknown>, and an interface
 * has no implicit index signature — one interface here makes the whole
 * schema fail that constraint, and every query silently degrades to
 * `never`.
 */

export type OpportunityType =
  | "job"
  | "internship"
  | "bachelor"
  | "master"
  | "doctorat"
  | "scholarship"
  | "concours";

export type OpportunityStatus = "open" | "closing_soon" | "closed" | "unknown";

export type EducationLevel = "bac" | "bac_plus_2" | "licence" | "master" | "doctorat" | "other";

export type ScraperRunStatus = "running" | "success" | "partial" | "failed";

export type Opportunity = {
  id: string;
  source_key: string;
  external_id: string;
  fingerprint: string;
  content_hash: string;

  title: string;
  type: OpportunityType;
  institution: string | null;
  institution_logo_url: string | null;
  domains: string[];
  location_city: string | null;
  location_region: string | null;
  is_remote: boolean;

  conditions_to_apply: string | null;
  required_education_level: EducationLevel | null;
  min_experience_years: number | null;
  max_age: number | null;
  languages_required: string[];
  positions_available: number | null;

  /** ISO timestamp. */
  deadline: string | null;
  event_date: string | null;
  published_at: string | null;

  application_link: string;
  description: string | null;
  attributes: Record<string, string>;

  status: OpportunityStatus;
  is_active: boolean;

  discovered_at: string;
  last_seen_at: string;
  updated_at: string;
};

export type Domain = {
  slug: string;
  label_fr: string;
  label_en: string;
  sort_order: number;
};

export type Source = {
  key: string;
  name: string;
  homepage_url: string;
  category: string | null;
  enabled: boolean;
  notes: string | null;
};

export type SourceHealth = {
  source_key: string;
  name: string;
  enabled: boolean;
  homepage_url: string;
  last_run_id: string | null;
  last_run_status: ScraperRunStatus | null;
  last_run_at: string | null;
  last_run_duration_ms: number | null;
  last_items_found: number | null;
  last_items_created: number | null;
  last_items_updated: number | null;
  last_items_failed: number | null;
  last_error_message: string | null;
  total_opportunities: number;
};

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
};

export type UserPreferences = {
  user_id: string;
  education_level: EducationLevel | null;
  /** Domain slugs. */
  fields_of_interest: string[];
  target_types: OpportunityType[];
  preferred_cities: string[];
  languages: string[];
  open_to_remote: boolean;
  email_alerts_enabled: boolean;
  deadline_reminder_days: number;
};

export type Bookmark = {
  user_id: string;
  opportunity_id: string;
  notes: string | null;
  created_at: string;
};

export type NotificationKind = "new_match" | "deadline_reminder";

export type Notification = {
  id: string;
  user_id: string;
  opportunity_id: string;
  kind: NotificationKind;
  created_at: string;
  sent_at: string | null;
  error: string | null;
};

/** One row from `recommended_opportunities()`; the RPC nests the record. */
export type RecommendedOpportunity = {
  opportunity: Opportunity;
  match_score: number;
  match_reasons: string[];
};

export type CityFacetRow = {
  city: string;
  opportunity_count: number;
};

export type ScraperRun = {
  id: string;
  run_group: string;
  source_key: string;
  status: ScraperRunStatus;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  pages_fetched: number;
  items_found: number;
  items_created: number;
  items_updated: number;
  items_unchanged: number;
  items_failed: number;
  error_type: string | null;
  error_message: string | null;
  warnings: string[];
};

/** Marks a table the app may read but never write. */
type ReadOnly = {
  Insert: Record<string, never>;
  Update: Record<string, never>;
  Relationships: [];
};

/**
 * Shaped like `supabase gen types typescript` output — Relationships,
 * Enums and CompositeTypes included — because supabase-js infers Insert
 * and Update payload types from exactly this structure and falls back to
 * `never` when a key is missing.
 */
export type Database = {
  public: {
    Tables: {
      // Ingestion is the only writer of the catalogue, so these are
      // read-only from the app's point of view. `ReadOnly` rather than
      // `never`: postgrest-js requires Insert/Update to extend
      // Record<string, unknown>, and a bare `never` makes the whole
      // schema fail that constraint and degrade to `never` everywhere.
      opportunities: { Row: Opportunity } & ReadOnly;
      domains: { Row: Domain } & ReadOnly;
      sources: { Row: Source } & ReadOnly;
      scraper_runs: { Row: ScraperRun } & ReadOnly;

      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string };
        Update: Partial<Omit<Profile, "id">>;
        Relationships: [];
      };
      user_preferences: {
        Row: UserPreferences;
        Insert: Partial<UserPreferences> & { user_id: string };
        Update: Partial<Omit<UserPreferences, "user_id">>;
        Relationships: [];
      };
      bookmarks: {
        Row: Bookmark;
        Insert: { user_id: string; opportunity_id: string; notes?: string | null };
        Update: { notes?: string | null };
        Relationships: [];
      };
      notifications: { Row: Notification } & ReadOnly;
    };
    Views: {
      source_health: { Row: SourceHealth; Relationships: [] };
      available_cities: { Row: CityFacetRow; Relationships: [] };
    };
    Functions: {
      recommended_opportunities: {
        Args: { p_limit?: number };
        Returns: RecommendedOpportunity[];
      };
    };
    Enums: {
      opportunity_type: OpportunityType;
      opportunity_status: OpportunityStatus;
      education_level: EducationLevel;
      scraper_run_status: ScraperRunStatus;
      notification_kind: NotificationKind;
    };
    CompositeTypes: Record<never, never>;
  };
};
