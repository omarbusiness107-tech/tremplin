import Link from "next/link";
import { ArrowUpRight, Building2, CalendarClock, MapPin, Users } from "lucide-react";

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
        "pressable group relative grid h-full w-full min-w-0 overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow-card)]",
        "sm:grid-cols-[11rem_minmax(0,1fr)] hover:border-border-strong hover:shadow-[var(--shadow-lift)]",
        closed && "opacity-70",
      )}
    >
      <OpportunityCover
        id={opportunity.id}
        type={opportunity.type}
        logoUrl={opportunity.institution_logo_url}
      />

      <div className="absolute end-3 top-3 z-10">
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

      <div className="flex min-w-0 flex-col p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center gap-1.5 pe-9">
          <Badge variant="default">{typeLabel(opportunity.type, dict)}</Badge>
          {isNew && <Badge variant="solid">{dict.card.new}</Badge>}
        </div>

        <h3 className="font-display text-base leading-snug font-semibold sm:text-[17px]">
          <Link
            href={`/${locale}/opportunities/${opportunity.id}`}
            dir="auto"
            className="stretched-link line-clamp-2 focus-visible:underline"
          >
            {opportunity.title}
          </Link>
        </h3>

        {opportunity.institution && (
          <p className="mt-2 flex items-start gap-1.5 text-[13px] text-muted-foreground">
            <Building2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span className="line-clamp-2" dir="auto">
              {opportunity.institution}
            </span>
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {opportunity.domains.slice(0, 2).map((slug) => (
            <Badge key={slug} variant="outline" dir="auto">
              {domainLabels.get(slug) ?? slug}
            </Badge>
          ))}
        </div>

        <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-4 text-xs text-subtle-foreground">
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

        <div className="mt-4 flex min-h-10 flex-wrap items-center gap-2 border-t border-border pt-3">
          <Badge variant={URGENCY_TONE[urgency]}>
            <CalendarClock className="size-3.5" aria-hidden />
            {deadlineLabel(opportunity.deadline, dict, locale)}
          </Badge>
          {matchReasons?.slice(0, 1).map((reason) => (
            <Badge key={reason} variant="outline">
              {reason}
            </Badge>
          ))}
          <ArrowUpRight className="ms-auto size-4 text-subtle-foreground transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" aria-hidden />
        </div>
      </div>
    </article>
  );
}
