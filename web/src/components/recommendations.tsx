import Link from "next/link";
import { Sparkles } from "lucide-react";

import { OpportunityCard } from "@/components/opportunity-card";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionary";
import type { Domain } from "@/lib/database.types";
import { bookmarkedIds } from "@/lib/bookmarks";
import { domainLabelMap, reasonLabels } from "@/lib/labels";
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
  locale,
  dict,
}: {
  signedIn: boolean;
  domains: Domain[];
  locale: Locale;
  dict: Dictionary;
}) {
  if (!signedIn) return null;

  const recommendations = await recommendedForUser(6);

  if (recommendations.length === 0) {
    return (
      <section className="flex flex-col items-start gap-4 rounded-xl border border-dashed border-border-strong bg-surface px-5 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <Sparkles className="size-4 text-primary" aria-hidden />
            {dict.recommendations.emptyTitle}
          </h2>
          <p className="text-sm text-muted-foreground">{dict.recommendations.emptyBody}</p>
        </div>
        <Button size="sm" asChild>
          <Link href={`/${locale}/profile`}>{dict.recommendations.emptyAction}</Link>
        </Button>
      </section>
    );
  }

  const domainLabels = domainLabelMap(domains, locale);
  const saved = await bookmarkedIds(recommendations.map((r) => r.opportunity.id));

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Sparkles className="size-4 text-primary" aria-hidden />
          {dict.recommendations.title}
        </h2>
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/${locale}/profile`}>{dict.recommendations.tune}</Link>
        </Button>
      </div>

      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {recommendations.map(({ opportunity, reasons }) => (
          <li key={opportunity.id} className="flex min-w-0">
            <OpportunityCard
              opportunity={opportunity}
              domainLabels={domainLabels}
              locale={locale}
              dict={dict}
              matchReasons={reasonLabels(reasons, dict)}
              bookmarked={saved.has(opportunity.id)}
              signedIn
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
