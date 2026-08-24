import type { OpportunityType } from "@/lib/database.types";

/**
 * Deadline urgency.
 *
 * Three bands rather than a gradient, so the colour means something
 * specific: this week, this month, later. Anything without a deadline is
 * "rolling", not "unknown" — from a user's point of view it just means
 * they can apply whenever.
 */
export type Urgency = "passed" | "urgent" | "soon" | "calm" | "rolling";

export function daysUntil(deadline: string | null, now = new Date()): number | null {
  if (!deadline) return null;
  const target = new Date(deadline);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}

export function urgencyOf(deadline: string | null, now = new Date()): Urgency {
  const days = daysUntil(deadline, now);
  if (days === null) return "rolling";
  if (days < 0) return "passed";
  if (days <= 7) return "urgent";
  if (days <= 30) return "soon";
  return "calm";
}

export const URGENCY_BADGE: Record<Urgency, "urgent" | "soon" | "calm" | "outline"> = {
  passed: "outline",
  urgent: "urgent",
  soon: "soon",
  calm: "calm",
  rolling: "outline",
};

/** Short, plain deadline label: "3 days left", "Closes 12 Sep". */
export function deadlineLabel(deadline: string | null, now = new Date()): string {
  const days = daysUntil(deadline, now);
  if (days === null) return "Rolling — no deadline";
  if (days < 0) return "Closed";
  if (days === 0) return "Closes today";
  if (days === 1) return "1 day left";
  if (days <= 30) return `${days} days left`;

  return `Closes ${new Date(deadline!).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

export const TYPE_LABELS: Record<OpportunityType, string> = {
  job: "Job",
  internship: "Internship",
  bachelor: "Bachelor",
  master: "Master",
  doctorat: "Doctorate",
  scholarship: "Scholarship",
  concours: "Concours",
};

/** True for listings first seen in the last 48 hours — drives the "New" badge. */
export function isNewlyDiscovered(discoveredAt: string, now = new Date()): boolean {
  const seen = new Date(discoveredAt).getTime();
  return Number.isFinite(seen) && now.getTime() - seen < 48 * 3_600_000;
}
