import { Suspense } from "react";
import Link from "next/link";

import { AccountMenu } from "@/components/account-menu";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionary";

export function SiteHeader({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex h-[4.5rem] w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link
          href={`/${locale}`}
          className="group flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <BrandMark />
          <span className="flex flex-col leading-none">
            <span className="font-display text-[17px] font-semibold tracking-tight">
              {dict.brand.name}
            </span>
            <span className="mt-0.5 hidden text-[11px] text-subtle-foreground sm:block">
              {dict.brand.tagline}
            </span>
          </span>
        </Link>

        <div className="ms-auto flex items-center gap-1.5">
          {/* The switcher reads the query string so it can preserve
              filters across a language change, and useSearchParams()
              opts a page out of static prerendering unless it sits
              behind a boundary. The fallback is the same size as the
              control, so nothing shifts when it hydrates. */}
          <Suspense fallback={<div className="h-8 w-[124px]" />}>
            <LanguageSwitcher locale={locale} label={dict.nav.language} />
          </Suspense>
          <span className="mx-0.5 hidden h-5 w-px bg-border sm:block" />
          <AccountMenu locale={locale} dict={dict} />
        </div>
      </div>
    </header>
  );
}

/**
 * A single khatim — the eight-point star of Moroccan zellij, struck the
 * way it actually is on a tile board: two squares, one turned 45°. The
 * same figure the listing covers tile, so the mark and the artwork are
 * visibly one idea rather than a logo bolted onto a theme.
 */
function BrandMark() {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500 via-primary to-cyan-500 text-white shadow-lg shadow-primary/20 transition-transform group-hover:rotate-3 group-hover:scale-105">
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" fill="none">
        <g stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
          <rect x="6.5" y="6.5" width="11" height="11" />
          <rect x="6.5" y="6.5" width="11" height="11" transform="rotate(45 12 12)" />
        </g>
        <circle cx="12" cy="12" r="2" fill="currentColor" />
      </svg>
    </span>
  );
}
