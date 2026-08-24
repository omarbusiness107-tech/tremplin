import Link from "next/link";
import { Sparkles } from "lucide-react";

import { OpportunityCard } from "@/components/opportunity-card";
import { Button } from "@/components/ui/button";
import type { Domain } from "@/lib/database.types";
import { bookmarkedIds } from "@/lib/bookmarks";
import { recommendedForUser } from "@/lib/opportunities";

/**
 * "Recommended for you", shown above the browse grid to signed-in users.
 *
 * Renders nothing at all when signed out, and a prompt rather than an
 * arbitrary list when the profile has nothing to match on.
 */
export async function Recommendations({
  signedIn,
  domains,
}: {
  signedIn: boolean;
  domains: Domain[];
}) {
  if (!signedIn) return null;

  const recommendations = await recommendedForUser(6);

  if (recommendations.length === 0) {
    return (
      <section className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border px-5 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="size-4 text-primary" aria-hidden />
            Get recommendations
          </h2>
          <p className="text-sm text-muted-foreground">
            Tell us your level, fields and the kinds of opportunity you want, and this
            list fills with what fits.
          </p>
        </div>
        <Button size="sm" asChild>
          <Link href="/profile">Complete your profile</Link>
        </Button>
      </section>
    );
  }

  const domainLabels = new Map(domains.map((d) => [d.slug, d.label_en]));
  const saved = await bookmarkedIds(recommendations.map((r) => r.opportunity.id));

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Sparkles className="size-4 text-primary" aria-hidden />
          Recommended for you
        </h2>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/profile">Tune</Link>
        </Button>
      </div>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {recommendations.map(({ opportunity, reasons }) => (
          <li key={opportunity.id} className="relative flex">
            <OpportunityCard
              opportunity={opportunity}
              domainLabels={domainLabels}
              matchReasons={reasons}
              bookmarked={saved.has(opportunity.id)}
              signedIn
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
