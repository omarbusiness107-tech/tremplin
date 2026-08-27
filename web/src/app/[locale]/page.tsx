import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SearchX, SlidersHorizontal, Sparkles } from "lucide-react";

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

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
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
    <section className="relative isolate overflow-hidden bg-[#151338] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_25%,rgba(129,92,246,0.58),transparent_32%),radial-gradient(circle_at_82%_15%,rgba(20,184,166,0.32),transparent_28%),radial-gradient(circle_at_72%_90%,rgba(236,72,153,0.25),transparent_30%)]" />
      <div className="absolute -top-24 end-[12%] size-72 rounded-full border-[52px] border-white/5" />
      <div className="absolute bottom-0 start-0 h-px w-full bg-gradient-to-r from-transparent via-white/25 to-transparent" />

      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur-md">
            <Sparkles className="size-3.5 text-amber-300" aria-hidden />
            {dict.brand.tagline}
          </p>
          <h1 className="max-w-3xl text-4xl leading-[1.05] font-bold text-balance sm:text-6xl">
            {dict.home.title}
          </h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-white/70 sm:text-lg">
            {dict.home.subtitle}
          </p>

          <dl className="mt-9 grid max-w-2xl grid-cols-3 gap-2 sm:gap-3">
            <Stat value={formatNumber(stats.total, locale)} label={dict.home.stats.opportunities} />
            <Stat value={formatNumber(stats.sources, locale)} label={dict.home.stats.sources} />
            <Stat
              value={formatNumber(stats.closingSoon, locale)}
              label={dict.home.stats.closingSoon}
              tone="urgent"
            />
          </dl>
        </div>

        <div className="relative hidden min-h-72 lg:block" aria-hidden="true">
          <div className="absolute start-10 top-4 w-64 -rotate-6 rounded-3xl border border-white/15 bg-gradient-to-br from-violet-500 to-indigo-950 p-5 shadow-2xl">
            <span className="text-xs font-semibold tracking-widest text-white/60">BAC+5</span>
            <p className="mt-12 font-display text-xl font-semibold">{dict.types.master}</p>
          </div>
          <div className="absolute end-3 top-20 w-60 rotate-6 rounded-3xl border border-white/15 bg-gradient-to-br from-teal-400 to-emerald-950 p-5 shadow-2xl">
            <span className="text-xs font-semibold tracking-widest text-white/60">EXPLORE</span>
            <p className="mt-12 font-display text-xl font-semibold">{dict.types.internship}</p>
          </div>
          <div className="absolute start-24 bottom-0 w-64 -rotate-1 rounded-3xl border border-white/15 bg-gradient-to-br from-pink-400 to-purple-950 p-5 shadow-2xl">
            <span className="text-xs font-semibold tracking-widest text-white/60">FUND</span>
            <p className="mt-12 font-display text-xl font-semibold">{dict.types.scholarship}</p>
          </div>
        </div>
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
    <div className="flex min-w-0 flex-col rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-3 backdrop-blur-sm sm:px-4">
      <dt className="order-2 text-xs text-white/55">{label}</dt>
      <dd
        className={`order-1 font-display text-2xl font-semibold tabular-nums ${
          tone === "urgent" ? "text-amber-300" : "text-white"
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
    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="min-w-0">
          <OpportunityCardSkeleton />
        </li>
      ))}
    </ul>
  );
}
