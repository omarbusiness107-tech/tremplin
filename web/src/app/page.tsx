import { Suspense } from "react";
import { SearchX, SlidersHorizontal } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { OpportunityCard } from "@/components/opportunity-card";
import { OpportunityCardSkeleton } from "@/components/opportunity-card-skeleton";
import { browseOpportunities, listDomains } from "@/lib/opportunities";

// Ingestion runs daily; revalidating hourly keeps the page cheap while
// still surfacing a new listing within the hour.
export const revalidate = 3600;

export default function HomePage() {
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

      <Suspense fallback={<OpportunityGridSkeleton />}>
        <OpportunityGrid />
      </Suspense>
    </div>
  );
}

async function OpportunityGrid() {
  const [{ opportunities, total, configured, error }, domains] = await Promise.all([
    browseOpportunities(),
    listDomains(),
  ]);

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
    return (
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
    );
  }

  const domainLabels = new Map(domains.map((d) => [d.slug, d.label_en]));

  return (
    <section className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {total} open {total === 1 ? "opportunity" : "opportunities"}
      </p>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {opportunities.map((opportunity) => (
          <li key={opportunity.id} className="relative flex">
            <OpportunityCard opportunity={opportunity} domainLabels={domainLabels} />
          </li>
        ))}
      </ul>
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
