import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Compass, Database, SearchX, SlidersHorizontal, TimerReset } from "lucide-react";

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
      <Hero
        dict={dict}
        locale={typed}
        stats={stats}
        filters={filters}
        domains={domains}
        cities={cities}
        domainLabels={Object.fromEntries(domainLabelMap(domains, typed))}
      />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
        {/* Recommendations load independently: a slow personalised query
            must not hold up the browse grid everyone shares. */}
        <Suspense fallback={null}>
          <Recommendations signedIn={signedIn} domains={domains} locale={typed} dict={dict} />
        </Suspense>

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
  filters,
  domains,
  cities,
  domainLabels,
}: {
  dict: Dictionary;
  locale: Locale;
  stats: { total: number; sources: number; closingSoon: number };
  filters: ReturnType<typeof parseFilters>;
  domains: Awaited<ReturnType<typeof listDomains>>;
  cities: Awaited<ReturnType<typeof listCities>>;
  domainLabels: Record<string, string>;
}) {
  return (
    <section className="relative isolate overflow-hidden border-b border-border bg-surface">
      <div className="absolute inset-y-0 end-0 hidden w-[42%] border-s border-border bg-primary-soft/30 lg:block" />
      <div className="relative mx-auto grid w-full max-w-7xl gap-8 px-4 pb-8 pt-12 sm:px-6 sm:pb-10 sm:pt-16 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)] lg:gap-12 lg:pt-20">
        <div className="motion-enter">
          <p className="mb-5 flex items-center gap-3 text-xs font-bold tracking-[0.16em] text-primary uppercase">
            <span className="h-px w-8 bg-primary" aria-hidden />
            01 / {dict.brand.tagline}
          </p>
          <h1 className="max-w-[14ch] text-[clamp(2.7rem,7vw,5.8rem)] leading-[0.98] font-bold tracking-[-0.055em]">
            {dict.home.title}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {dict.home.subtitle}
          </p>
        </div>

        <dl className="motion-enter grid grid-cols-3 border-y border-border bg-background/80 lg:grid-cols-1 lg:border lg:bg-surface" style={{ animationDelay: "80ms" }}>
          <Stat icon={Compass} value={formatNumber(stats.total, locale)} label={dict.home.stats.opportunities} />
          <Stat icon={Database} value={formatNumber(stats.sources, locale)} label={dict.home.stats.sources} />
          <Stat icon={TimerReset} value={formatNumber(stats.closingSoon, locale)} label={dict.home.stats.closingSoon} tone="urgent" />
        </dl>

        <div className="motion-enter lg:col-span-2" style={{ animationDelay: "140ms" }}>
          <FilterPanel
            filters={filters}
            domains={domains}
            cities={cities}
            dict={dict}
            domainLabels={domainLabels}
          />
        </div>
      </div>
    </section>
  );
}

function Stat({
  value,
  label,
  tone,
  icon: Icon,
}: {
  value: string;
  label: string;
  tone?: "urgent";
  icon: typeof Compass;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 border-e border-border px-3 py-4 last:border-e-0 sm:px-5 lg:border-e-0 lg:border-b lg:py-6 lg:last:border-b-0">
      <Icon className={`size-4 ${tone === "urgent" ? "text-urgent" : "text-primary"}`} aria-hidden />
      <dd
        className={`font-display text-2xl font-bold tabular-nums sm:text-3xl ${
          tone === "urgent" ? "text-urgent" : "text-foreground"
        }`}
      >
        {value}
      </dd>
      <dt className="text-[11px] leading-tight font-semibold tracking-wide text-subtle-foreground uppercase">{label}</dt>
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
    <section id="opportunities" className="flex scroll-mt-24 flex-col gap-5">
      <p className="border-b border-border pb-3 text-sm font-medium text-muted-foreground tabular-nums">
        {interpolate(dict.list.showing, { first, last, total })}
      </p>

      <ul className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {opportunities.map((opportunity) => (
          <li key={opportunity.id} className="flex min-w-0">
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
    <ul className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="min-w-0">
          <OpportunityCardSkeleton />
        </li>
      ))}
    </ul>
  );
}
