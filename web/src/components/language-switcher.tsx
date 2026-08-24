"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Languages } from "lucide-react";

import { LOCALES, LOCALE_NAMES, LOCALE_SHORT, isLocale, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/**
 * Swaps the locale segment in place, keeping the rest of the path and
 * every query parameter — so switching language from a filtered search
 * keeps the filters and the page you were on, rather than dumping you
 * back at the home page in another language.
 */
export function LanguageSwitcher({ locale, label }: { locale: Locale; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function switchTo(next: Locale) {
    if (next === locale) return;

    const segments = pathname.split("/");
    // segments[0] is the empty string before the leading slash.
    if (isLocale(segments[1])) {
      segments[1] = next;
    } else {
      segments.splice(1, 0, next);
    }

    const query = searchParams.toString();
    startTransition(() => router.push(segments.join("/") + (query ? `?${query}` : "")));
  }

  return (
    <div
      className="flex items-center gap-0.5 rounded-full border border-border bg-surface p-0.5"
      role="group"
      aria-label={label}
    >
      <Languages className="ms-1.5 size-3.5 shrink-0 text-subtle-foreground" aria-hidden />
      {LOCALES.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => switchTo(option)}
          disabled={isPending}
          aria-current={option === locale ? "true" : undefined}
          title={LOCALE_NAMES[option]}
          className={cn(
            "rounded-full px-2 py-1 text-xs font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            option === locale
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}
        >
          <span className="sr-only">{LOCALE_NAMES[option]}</span>
          <span aria-hidden>{LOCALE_SHORT[option]}</span>
        </button>
      ))}
    </div>
  );
}
