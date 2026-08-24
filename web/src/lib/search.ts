/**
 * Which search vector to query.
 *
 * Listings appear in French and Arabic, and one Postgres text search
 * configuration cannot serve both: snowball dictionaries stem every token
 * they are handed and never fall through to the next dictionary, so
 * `french` and `arabic` cannot be chained into a single config. The
 * database therefore stores two vectors and the query picks one by the
 * script the person typed in.
 *
 * What the Arabic configuration buys is clitic stripping, which is the
 * dominant problem in Arabic search: an announcement writes الترشيح but a
 * person types ترشيح, and under the French configuration those are simply
 * different tokens. It does not unify broken plurals (مباراة and مباريات
 * still stem apart) — that would need trigram or lemma-based matching.
 */

/** Arabic, Arabic Supplement, Extended-A, and Arabic Presentation Forms. */
const ARABIC_SCRIPT = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

export interface SearchTarget {
  column: "search_vector" | "search_vector_ar";
  config: "french" | "arabic";
}

export const FRENCH_SEARCH: SearchTarget = { column: "search_vector", config: "french" };
export const ARABIC_SEARCH: SearchTarget = { column: "search_vector_ar", config: "arabic" };

/**
 * A query containing any Arabic character is treated as Arabic.
 *
 * Deliberately not a ratio: a mixed query like "bourse ماستر" is one a
 * person types when they want the Arabic listings, and the Latin half
 * still tokenises under the Arabic configuration.
 */
export function searchTargetFor(query: string): SearchTarget {
  return ARABIC_SCRIPT.test(query) ? ARABIC_SEARCH : FRENCH_SEARCH;
}

export function isArabic(text: string): boolean {
  return ARABIC_SCRIPT.test(text);
}
