import type { Locale } from "@/i18n/config";
import type {
  Domain,
  EducationLevel,
  Opportunity,
  OpportunityType,
} from "@/lib/database.types";
import type { Dictionary } from "@/i18n/dictionary";
import { formatDate, interpolate, plural } from "@/i18n/format";

/**
 * Turning stored values into the reader's language.
 *
 * The listings themselves stay in whatever language the source published
 * them in — a French concours notice is not machine-translated into
 * Arabic, and pretending otherwise would put invented wording next to an
 * official announcement. What is translated is everything the app itself
 * says: type badges, deadline phrasing, domain tags, field labels.
 */

export function typeLabel(type: OpportunityType, dict: Dictionary): string {
  return dict.types[type] ?? type;
}

export function educationLabel(level: EducationLevel, dict: Dictionary): string {
  return dict.education[level] ?? level;
}

/** Domain slugs resolve through the `domains` table, which carries all three. */
export function domainLabelMap(domains: Domain[], locale: Locale): Map<string, string> {
  return new Map(
    domains.map((d) => [
      d.slug,
      locale === "ar" ? d.label_ar : locale === "en" ? d.label_en : d.label_fr,
    ]),
  );
}

export function daysUntil(deadline: string | null, now = new Date()): number | null {
  if (!deadline) return null;
  const target = new Date(deadline);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}

export type Urgency = "passed" | "urgent" | "soon" | "calm" | "rolling";

export function urgencyOf(deadline: string | null, now = new Date()): Urgency {
  const days = daysUntil(deadline, now);
  if (days === null) return "rolling";
  if (days < 0) return "passed";
  if (days <= 7) return "urgent";
  if (days <= 30) return "soon";
  return "calm";
}

export const URGENCY_TONE: Record<Urgency, "urgent" | "soon" | "calm" | "neutral"> = {
  passed: "neutral",
  urgent: "urgent",
  soon: "soon",
  calm: "calm",
  rolling: "neutral",
};

export function deadlineLabel(
  deadline: string | null,
  dict: Dictionary,
  locale: Locale,
  now = new Date(),
): string {
  const days = daysUntil(deadline, now);
  if (days === null) return dict.deadline.rolling;
  if (days < 0) return dict.deadline.closed;
  if (days === 0) return dict.deadline.today;
  if (days === 1) return dict.deadline.oneDay;
  if (days <= 30) return interpolate(dict.deadline.days, { count: days });

  return interpolate(dict.deadline.closesOn, {
    date: formatDate(deadline!, locale, { day: "numeric", month: "short", year: "numeric" }),
  });
}

export function positionsLabel(count: number, dict: Dictionary): string {
  return plural(dict.card.positions, count);
}

const PROGRAMME_TYPES = new Set<OpportunityType>(["bachelor", "master", "doctorat"]);

export function locationLabel(opportunity: Opportunity, dict: Dictionary): string {
  if (opportunity.is_remote) return dict.card.remote;

  // A study programme belongs to its named school/campus. This is more
  // useful than a broad city label and avoids presenting a programme such
  // as "FS Agadir" as if it were available throughout Morocco.
  if (PROGRAMME_TYPES.has(opportunity.type) && opportunity.institution) {
    return opportunity.institution;
  }

  return opportunity.location_city ?? dict.card.nationwide;
}

/** True for listings first seen in the last 48 hours — drives the "New" badge. */
export function isNewlyDiscovered(discoveredAt: string, now = new Date()): boolean {
  const seen = new Date(discoveredAt).getTime();
  return Number.isFinite(seen) && now.getTime() - seen < 48 * 3_600_000;
}

/**
 * Recommendation reasons come back from SQL as English sentences, which
 * is fine as a stable key but not as UI text. Map them to the
 * dictionary; anything unrecognised is dropped rather than shown raw.
 */
const REASON_KEYS: Record<string, keyof Dictionary["recommendations"]["reasons"]> = {
  "In one of your fields": "field",
  Remote: "remote",
  "In a city you chose": "city",
  "You meet the education requirement": "education",
  "Matches the type you are looking for": "type",
};

export function reasonLabels(reasons: string[], dict: Dictionary): string[] {
  return reasons
    .map((reason) => REASON_KEYS[reason])
    .filter((key): key is keyof Dictionary["recommendations"]["reasons"] => Boolean(key))
    .map((key) => dict.recommendations.reasons[key]);
}
