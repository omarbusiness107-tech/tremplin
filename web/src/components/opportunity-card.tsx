import Link from "next/link";
import { Building2, CalendarClock, MapPin, Users } from "lucide-react";

import { BookmarkButton } from "@/components/bookmark-button";
import { OpportunityCover } from "@/components/opportunity-cover";
import { Badge } from "@/components/ui/badge";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionary";
import type { Opportunity } from "@/lib/database.types";
import {
  URGENCY_TONE,
  deadlineLabel,
  isNewlyDiscovered,
  locationLabel,
  positionsLabel,
  typeLabel,
  urgencyOf,
} from "@/lib/labels";
import { cn } from "@/lib/utils";

interface Props {
  opportunity: Opportunity;
  domainLabels: Map<string, string>;
  locale: Locale;
  dict: Dictionary;
  bookmarked?: boolean;
  signedIn?: boolean;
  /** Why this was recommended, when shown in the recommendations rail. */
  matchReasons?: string[];
}

export function OpportunityCard({
  opportunity,
  domainLabels,
  locale,
  dict,
  bookmarked = false,
  signedIn = false,
  matchReasons,
}: Props) {
  const urgency = urgencyOf(opportunity.deadline);
  const closed = opportunity.status === "closed";
  const isNew = !closed && isNewlyDiscovered(opportunity.discovered_at);

  return (
    <article
      className={cn(
        "group relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-[1.35rem] border border-border bg-surface",
        "shadow-[var(--shadow-card)] transition-all duration-300",
        "hover:-translate-y-1 hover:border-border-strong hover:shadow-[var(--shadow-lift)]",
        closed && "opacity-70",
      )}
    >
      <OpportunityCover
        id={opportunity.id}
        type={opportunity.type}
        logoUrl={opportunity.institution_logo_url}
      />

      {/* Floated over the cover so the type badge reads against artwork
          rather than eating a line of the card body. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="glass">{typeLabel(opportunity.type, dict)}</Badge>
          {isNew && <Badge variant="solid">{dict.card.new}</Badge>}
        </div>
        <div className="pointer-events-auto">
          <BookmarkButton
            opportunityId={opportunity.id}
            bookmarked={bookmarked}
            signedIn={signedIn}
            locale={locale}
            labels={{ save: dict.card.save, unsave: dict.card.unsave }}
            variant="glass"
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <h3 className="min-h-[2.75rem] font-display text-[15px] leading-snug font-semibold">
          <Link
            href={`/${locale}/opportunities/${opportunity.id}`}
            dir="auto"
            className="stretched-link line-clamp-2 focus-visible:underline"
          >
            {opportunity.title}
          </Link>
        </h3>

        {opportunity.institution && (
          <p className="flex min-h-9 items-start gap-1.5 text-[13px] text-muted-foreground">
            <Building2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span className="line-clamp-2" dir="auto">
              {opportunity.institution}
            </span>
          </p>
        )}

        <div className="flex flex-wrap gap-1.5">
          {opportunity.domains.slice(0, 2).map((slug) => (
            <Badge key={slug} variant="outline" dir="auto">
              {domainLabels.get(slug) ?? slug}
            </Badge>
          ))}
        </div>

        <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[11px] text-subtle-foreground">
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden />
            <span dir="auto">{locationLabel(opportunity, dict)}</span>
          </span>
          {opportunity.positions_available != null && (
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5" aria-hidden />
              {positionsLabel(opportunity.positions_available, dict)}
            </span>
          )}
        </div>
      </div>

      <div className="flex min-h-14 flex-wrap items-center gap-2 border-t border-border bg-surface-sunken/45 px-5 py-3">
        <Badge variant={URGENCY_TONE[urgency]}>
          <CalendarClock className="size-3.5" aria-hidden />
          {deadlineLabel(opportunity.deadline, dict, locale)}
        </Badge>
        {matchReasons?.slice(0, 1).map((reason) => (
          <Badge key={reason} variant="outline">
            {reason}
          </Badge>
        ))}
      </div>
    </article>
  );
}
