import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SearchX, SlidersHorizontal } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { FilterPanel } from "@/components/filter-panel";
import { OpportunityCard } from "@/components/opportunity-card";
import { OpportunityCardSkeleton } from "@/components/opportunity-card-skeleton";
import { Pagination } from "@/components/pagination";
import { Recommendations } from "@/components/recommendations";
import { Button } from "@/components/ui/button";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary, type Dictionary } from "@/i18n/dictionary";
import { formatNumber, interpolate } from "@/i18n/format";
import { getCurrentUser } from "@/lib/auth";
import { bookmarkedIds } from "@/lib/bookmarks";
import { PAGE_SIZE, isUnfiltered, parseFilters, type RawSearchParams } from "@/lib/filters";
import { domainLabelMap } from "@/lib/labels";
import { browseOpportunities, catalogueStats, listCities, listDomains } from "@/lib/opportunities";

export default async function HomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const typed = locale as Locale;
  const [dict, query] = await Promise.all([getDictionary(typed), searchParams]);
  const filters = parseFilters(query);

  const [domains, cities, user, stats] = await Promise.all([
    listDomains(),
    listCities(),
    getCurrentUser(),
    catalogueStats(),
  ]);
  const signedIn = user !== null;

  return (
    <>
      <Hero dict={dict} locale={typed} stats={stats} />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-4 sm:px-6">
        {/* Recommendations load independently: a slow personalised query
            must not hold up the browse grid everyone shares. */}
        <Suspense fallback={null}>
          <Recommendations signedIn={signedIn} domains={domains} locale={typed} dict={dict} />
        </Suspense>

        <FilterPanel
          filters={filters}
          domains={domains}
          cities={cities}
          dict={dict}
          domainLabels={Object.fromEntries(domainLabelMap(domains, typed))}
        />

        {/* Keyed on the filters so changing them re-suspends and the
            skeletons come back, instead of the old results sitting there
            looking current. */}
        <Suspense key={JSON.stringify(filters)} fallback={<OpportunityGridSkeleton />}>
          <OpportunityGrid
            filters={filters}
            domains={domains}
            signedIn={signedIn}
            locale={typed}
            dict={dict}
          />
        </Suspense>
      </div>
    </>
  );
}

function Hero({
  dict,
  locale,
  stats,
}: {
  dict: Dictionary;
  locale: Locale;
  stats: { total: number; sources: number; closingSoon: number };
}) {
  return (
    <section className="relative overflow-hidden border-b border-border bg-surface-sunken">
      {/* The same khatim that tiles the cards, blown up and faded — the
          page and the artwork share one geometry rather than the header
          being a different idea from the grid. */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full text-primary opacity-[0.07]"
      >
        <defs>
          <pattern id="hero-zellij" width="72" height="72" patternUnits="userSpaceOnUse">
            <g
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              transform="translate(36 36)"
            >
              <rect x="-19" y="-19" width="38" height="38" />
              <rect x="-19" y="-19" width="38" height="38" transform="rotate(45)" />
              <circle r="5" />
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hero-zellij)" />
      </svg>

      <div className="relative mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <h1 className="max-w-3xl text-3xl leading-[1.1] font-bold sm:text-5xl">
          {dict.home.title}
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
          {dict.home.subtitle}
        </p>

        <dl className="mt-8 flex flex-wrap gap-x-8 gap-y-4">
          <Stat value={formatNumber(stats.total, locale)} label={dict.home.stats.opportunities} />
          <Stat value={formatNumber(stats.sources, locale)} label={dict.home.stats.sources} />
          <Stat
            value={formatNumber(stats.closingSoon, locale)}
            label={dict.home.stats.closingSoon}
            tone="urgent"
          />
        </dl>
      </div>
    </section>
  );
}

function Stat({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone?: "urgent";
}) {
  return (
    <div className="flex flex-col">
      <dt className="order-2 text-xs text-subtle-foreground">{label}</dt>
      <dd
        className={`order-1 font-display text-2xl font-semibold tabular-nums ${
          tone === "urgent" ? "text-urgent" : "text-foreground"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

async function OpportunityGrid({
  filters,
  domains,
  signedIn,
  locale,
  dict,
}: {
  filters: ReturnType<typeof parseFilters>;
  domains: Awaited<ReturnType<typeof listDomains>>;
  signedIn: boolean;
  locale: Locale;
  dict: Dictionary;
}) {
  const { opportunities, total, page, pageCount, configured, error } =
    await browseOpportunities(filters);

  if (!configured) {
    return (
      <EmptyState
        icon={<SlidersHorizontal className="size-5" aria-hidden />}
        title={dict.list.notConfigured.title}
        description={dict.list.notConfigured.body}
        state="not-configured"
      />
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<SearchX className="size-5" aria-hidden />}
        title={dict.list.loadError.title}
        description={error}
        state="load-error"
      />
    );
  }

  if (opportunities.length === 0) {
    return isUnfiltered(filters) ? (
      <EmptyState
        icon={<SearchX className="size-5" aria-hidden />}
        title={dict.list.emptyDatabase.title}
        description={dict.list.emptyDatabase.body}
        state="empty-database"
      />
    ) : (
      <EmptyState
        icon={<SearchX className="size-5" aria-hidden />}
        title={dict.list.emptyFiltered.title}
        description={dict.list.emptyFiltered.body}
        state="no-matches"
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href={`/${locale}`}>{dict.list.emptyFiltered.action}</Link>
          </Button>
        }
      />
    );
  }

  const domainLabels = domainLabelMap(domains, locale);
  const saved = await bookmarkedIds(opportunities.map((o) => o.id));
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);

  return (
    <section className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground tabular-nums">
        {interpolate(dict.list.showing, { first, last, total })}
      </p>

      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {opportunities.map((opportunity) => (
          <li key={opportunity.id} className="flex">
            <OpportunityCard
              opportunity={opportunity}
              domainLabels={domainLabels}
              locale={locale}
              dict={dict}
              bookmarked={saved.has(opportunity.id)}
              signedIn={signedIn}
            />
          </li>
        ))}
      </ul>

      <Pagination filters={filters} pageCount={pageCount} pathname={`/${locale}`} />
    </section>
  );
}

function OpportunityGridSkeleton() {
  return (
    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i}>
          <OpportunityCardSkeleton />
        </li>
      ))}
    </ul>
  );
}
