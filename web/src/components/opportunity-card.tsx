import Link from "next/link";
import { Building2, CalendarClock, MapPin, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { Opportunity } from "@/lib/database.types";
import {
  TYPE_LABELS,
  URGENCY_BADGE,
  deadlineLabel,
  isNewlyDiscovered,
  urgencyOf,
} from "@/lib/deadline";
import { cn } from "@/lib/utils";

interface Props {
  opportunity: Opportunity;
  domainLabels: Map<string, string>;
}

export function OpportunityCard({ opportunity, domainLabels }: Props) {
  const urgency = urgencyOf(opportunity.deadline);
  const closed = opportunity.status === "closed";

  return (
    <Card
      className={cn(
        "group h-full transition-shadow hover:shadow-md",
        closed && "opacity-65",
      )}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <Badge variant="secondary">{TYPE_LABELS[opportunity.type]}</Badge>
          {!closed && isNewlyDiscovered(opportunity.discovered_at) && <Badge>New</Badge>}
        </div>

        <CardTitle className="mt-1 line-clamp-3">
          {/* Stretched link: the whole card is the target, but only the
              title is in the tab order and read out as the link. */}
          <Link
            href={`/opportunities/${opportunity.id}`}
            className="after:absolute after:inset-0 focus-visible:underline"
          >
            {opportunity.title}
          </Link>
        </CardTitle>

        {opportunity.institution && (
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <Building2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span className="line-clamp-2">{opportunity.institution}</span>
          </p>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {opportunity.domains.slice(0, 3).map((slug) => (
            <Badge key={slug} variant="outline">
              {domainLabels.get(slug) ?? slug}
            </Badge>
          ))}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-3.5" aria-hidden />
            {opportunity.is_remote
              ? "Remote"
              : (opportunity.location_city ?? "Morocco — nationwide")}
          </span>
          {opportunity.positions_available != null && (
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3.5" aria-hidden />
              {opportunity.positions_available}{" "}
              {opportunity.positions_available === 1 ? "position" : "positions"}
            </span>
          )}
        </div>
      </CardContent>

      <CardFooter>
        <Badge variant={URGENCY_BADGE[urgency]}>
          <CalendarClock className="size-3.5" aria-hidden />
          {deadlineLabel(opportunity.deadline)}
        </Badge>
      </CardFooter>
    </Card>
  );
}
