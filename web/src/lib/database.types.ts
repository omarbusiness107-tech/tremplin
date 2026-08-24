/**
 * Types for the tables in supabase/migrations/.
 *
 * Kept by hand for now so the app has types before a Supabase project
 * exists. Once one does, regenerate instead of editing:
 *
 *   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
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

export interface Opportunity {
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
}

export interface Domain {
  slug: string;
  label_fr: string;
  label_en: string;
  sort_order: number;
}

export interface Source {
  key: string;
  name: string;
  homepage_url: string;
  category: string | null;
  enabled: boolean;
  notes: string | null;
}

export interface SourceHealth {
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
}

export interface Database {
  public: {
    Tables: {
      opportunities: { Row: Opportunity; Insert: never; Update: never };
      domains: { Row: Domain; Insert: never; Update: never };
      sources: { Row: Source; Insert: never; Update: never };
    };
    Views: {
      source_health: { Row: SourceHealth };
    };
  };
}
