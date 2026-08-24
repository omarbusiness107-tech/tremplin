import "server-only";

import type { Locale } from "@/i18n/config";
import fr from "@/i18n/dictionaries/fr.json";

/**
 * The French dictionary is the source of truth: it types the other two,
 * so a key added here but forgotten in `en.json` or `ar.json` is a
 * compile error rather than a string that silently renders as its own
 * key path in production.
 */
export type Dictionary = typeof fr;

// Static imports, not a dynamic path — the bundler can then tree-shake
// per route and there is no runtime file read on a cold serverless start.
const DICTIONARIES: Record<Locale, () => Promise<Dictionary>> = {
  fr: async () => fr,
  en: async () => (await import("@/i18n/dictionaries/en.json")).default,
  ar: async () => (await import("@/i18n/dictionaries/ar.json")).default,
};

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return DICTIONARIES[locale]();
}
