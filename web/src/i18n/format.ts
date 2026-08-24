import type { Locale } from "@/i18n/config";

/**
 * `{name}` placeholder substitution.
 *
 * Deliberately not a full ICU implementation: the only things this app
 * interpolates are counts, dates and one link label, and every plural it
 * needs is handled by an explicit `one` / `other` pair in the
 * dictionaries. A real ICU runtime would be a dependency and a build
 * step for no behaviour we use.
 */
export function interpolate(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/**
 * Pick the plural form and interpolate `{count}`.
 *
 * Arabic has six grammatical plural categories; the dictionaries here use
 * a two-form approximation that reads correctly for the ranges this app
 * actually shows (a filter count, a position count, a saved count — all
 * small integers, never zero, since a zero-count string is never
 * rendered). Anything needing the full set should move to Intl.PluralRules.
 */
export function plural(
  forms: { one: string; other: string },
  count: number,
  extra: Record<string, string | number> = {},
): string {
  return interpolate(count === 1 ? forms.one : forms.other, { count, ...extra });
}

/** Locale tags for Intl, pinned to Morocco so dates read as they should locally. */
const INTL_LOCALES: Record<Locale, string> = {
  fr: "fr-MA",
  en: "en-GB",
  // Latin digits rather than Eastern Arabic numerals: Moroccan Arabic
  // uses ٠١٢ almost nowhere in official notices, which write dates in
  // Latin digits.
  ar: "ar-MA-u-nu-latn",
};

export function intlLocale(locale: Locale): string {
  return INTL_LOCALES[locale];
}

export function formatDate(
  value: string | Date,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { dateStyle: "long" },
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), options).format(date);
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(value);
}
