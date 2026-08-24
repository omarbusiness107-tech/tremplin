import { Suspense } from "react";
import Link from "next/link";
import { SearchX, SlidersHorizontal } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { FilterPanel } from "@/components/filter-panel";
import { OpportunityCard } from "@/components/opportunity-card";
import { OpportunityCardSkeleton } from "@/components/opportunity-card-skeleton";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { PAGE_SIZE, isUnfiltered, parseFilters, type RawSearchParams } from "@/lib/filters";
import { browseOpportunities, listCities, listDomains } from "@/lib/opportunities";

export const metadata = {
  title: "Browse opportunities",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const [domains, cities] = await Promise.all([listDomains(), listCities()]);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Opportunities in Morocco
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Jobs, internships, degree programmes, scholarships and concours, collected daily
          from public sources and sorted by how soon they close.
        </p>
      </section>

      <FilterPanel filters={filters} domains={domains} cities={cities} />

      {/* Keyed on the filters so changing them re-suspends and the
          skeletons come back, instead of the old results sitting there
          looking current. */}
      <Suspense key={JSON.stringify(filters)} fallback={<OpportunityGridSkeleton />}>
        <OpportunityGrid filters={filters} domains={domains} />
      </Suspense>
    </div>
  );
}

async function OpportunityGrid({
  filters,
  domains,
}: {
  filters: ReturnType<typeof parseFilters>;
  domains: Awaited<ReturnType<typeof listDomains>>;
}) {
  const { opportunities, total, page, pageCount, configured, error } =
    await browseOpportunities(filters);

  if (!configured) {
    return (
      <EmptyState
        icon={<SlidersHorizontal className="size-5" aria-hidden />}
        title="Supabase is not configured yet"
        description={
          <>
            Copy <code className="font-mono text-xs">web/.env.example</code> to{" "}
            <code className="font-mono text-xs">web/.env.local</code> and fill in your
            project URL and anon key, then reload.
          </>
        }
      />
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<SearchX className="size-5" aria-hidden />}
        title="Could not load opportunities"
        description={error}
      />
    );
  }

  if (opportunities.length === 0) {
    return isUnfiltered(filters) ? (
      <EmptyState
        icon={<SearchX className="size-5" aria-hidden />}
        title="No open opportunities yet"
        description={
          <>
            The database is reachable but empty. Run the ingestion job —{" "}
            <code className="font-mono text-xs">
              python -m morocco_scraper run --source emploi_public
            </code>{" "}
            — and reload.
          </>
        }
      />
    ) : (
      <EmptyState
        icon={<SearchX className="size-5" aria-hidden />}
        title="No opportunities match your filters"
        description="Try widening your search — remove a field or a city, or extend the deadline window."
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href="/">Clear all filters</Link>
          </Button>
        }
      />
    );
  }

  const domainLabels = new Map(domains.map((d) => [d.slug, d.label_en]));
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);

  return (
    <section className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        {total === 0
          ? "No results"
          : `Showing ${first}–${last} of ${total} ${total === 1 ? "opportunity" : "opportunities"}`}
      </p>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {opportunities.map((opportunity) => (
          <li key={opportunity.id} className="relative flex">
            <OpportunityCard opportunity={opportunity} domainLabels={domainLabels} />
          </li>
        ))}
      </ul>

      <Pagination filters={filters} pageCount={pageCount} />
    </section>
  );
}

function OpportunityGridSkeleton() {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i}>
          <OpportunityCardSkeleton />
        </li>
      ))}
    </ul>
  );
}
