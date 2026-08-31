import { Suspense } from "react";
import Link from "next/link";
import { Milestone } from "lucide-react";

import { AccountMenu } from "@/components/account-menu";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionary";

export function SiteHeader({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur-lg">
      <div className="mx-auto flex h-[4.25rem] w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link
          href={`/${locale}`}
          className="group flex items-center gap-2.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <BrandMark />
          <span className="hidden flex-col leading-none sm:flex">
            <span className="font-display text-[17px] font-semibold tracking-tight">
              {dict.brand.name}
            </span>
            <span className="mt-0.5 hidden text-[11px] text-subtle-foreground sm:block">
              {dict.brand.tagline}
            </span>
          </span>
        </Link>

        <nav className="ms-5 hidden items-center gap-1 border-s border-border ps-5 md:flex" aria-label={dict.nav.browse}>
          <Link
            href={`/${locale}#opportunities`}
            className="rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors duration-200 hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {dict.nav.browse}
          </Link>
        </nav>

        <div className="ms-auto flex items-center gap-1.5">
          <ThemeToggle
            labels={{
              theme: dict.nav.theme,
              system: dict.nav.themeSystem,
              light: dict.nav.themeLight,
              dark: dict.nav.themeDark,
            }}
          />
          {/* The switcher reads the query string so it can preserve
              filters across a language change, and useSearchParams()
              opts a page out of static prerendering unless it sits
              behind a boundary. The fallback is the same size as the
              control, so nothing shifts when it hydrates. */}
          <Suspense fallback={<div className="h-8 w-[124px]" />}>
            <LanguageSwitcher locale={locale} label={dict.nav.language} />
          </Suspense>
          <span className="mx-0.5 hidden h-5 w-px bg-border lg:block" />
          <AccountMenu locale={locale} dict={dict} />
        </div>
      </div>
    </header>
  );
}

function BrandMark() {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-primary text-primary-foreground shadow-[3px_3px_0_var(--foreground)] transition-transform duration-200 ease-out group-active:scale-[0.98]">
      <Milestone className="size-5" strokeWidth={1.8} aria-hidden />
    </span>
  );
}
