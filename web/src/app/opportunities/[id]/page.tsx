import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CalendarDays,
  ExternalLink,
  GraduationCap,
  Languages,
  MapPin,
  Users,
} from "lucide-react";

import { BookmarkButton } from "@/components/bookmark-button";
import { OpportunityCard } from "@/components/opportunity-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EducationLevel, Opportunity } from "@/lib/database.types";
import { TYPE_LABELS, URGENCY_BADGE, deadlineLabel, urgencyOf } from "@/lib/deadline";
import { getCurrentUser } from "@/lib/auth";
import { bookmarkedIds } from "@/lib/bookmarks";
import { getOpportunity, listDomains, relatedOpportunities } from "@/lib/opportunities";

const EDUCATION_LABELS: Record<EducationLevel, string> = {
  bac: "Baccalauréat",
  bac_plus_2: "Bac +2",
  licence: "Licence (Bac +3)",
  master: "Master (Bac +5)",
  doctorat: "Doctorate",
  other: "Other",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const opportunity = await getOpportunity(id);
  if (!opportunity) return { title: "Opportunity not found" };

  return {
    title: opportunity.title,
    description:
      opportunity.institution ??
      `${TYPE_LABELS[opportunity.type]} opportunity in Morocco`,
  };
}

export default async function OpportunityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const opportunity = await getOpportunity(id);
  if (!opportunity) notFound();

  const [domains, related, user, saved] = await Promise.all([
    listDomains(),
    relatedOpportunities(opportunity),
    getCurrentUser(),
    bookmarkedIds([id]),
  ]);
  const domainLabels = new Map(domains.map((d) => [d.slug, d.label_en]));

  const urgency = urgencyOf(opportunity.deadline);

  // "Conditions to apply" is drawn from the same label/value pairs, so
  // showing them again under Details would just repeat the card above.
  const shownInConditions = labelsIn(opportunity.conditions_to_apply);
  const attributes = Object.entries(opportunity.attributes ?? {}).filter(
    ([label]) => !shownInConditions.has(label),
  );

  return (
    <article className="flex flex-col gap-8">
      <Link
        href="/"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All opportunities
      </Link>

      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{TYPE_LABELS[opportunity.type]}</Badge>
          <Badge variant={URGENCY_BADGE[urgency]}>
            <CalendarClock className="size-3.5" aria-hidden />
            {deadlineLabel(opportunity.deadline)}
          </Badge>
          {opportunity.status === "closed" && <Badge variant="outline">Closed</Badge>}
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl" dir="auto">
          {opportunity.title}
        </h1>

        {opportunity.institution && (
          <p className="flex items-center gap-2 text-muted-foreground" dir="auto">
            <Building2 className="size-4 shrink-0" aria-hidden />
            {opportunity.institution}
          </p>
        )}

        <div className="flex flex-wrap gap-1.5">
          {opportunity.domains.map((slug) => (
            <Badge key={slug} variant="outline">
              {domainLabels.get(slug) ?? slug}
            </Badge>
          ))}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-6">
          {opportunity.conditions_to_apply && (
            <Section title="Conditions to apply">
              <DefinitionList text={opportunity.conditions_to_apply} />
            </Section>
          )}

          {attributes.length > 0 && (
            <Section title="Details">
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {attributes.map(([label, value]) => (
                  <div key={label} className="flex flex-col gap-0.5">
                    <dt className="text-xs tracking-wide text-muted-foreground uppercase">
                      {label}
                    </dt>
                    <dd className="text-sm break-words" dir="auto">{renderValue(value)}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

          {opportunity.description && attributes.length === 0 && (
            <Section title="Description">
              <DefinitionList text={opportunity.description} />
            </Section>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          {/* Sticky so the apply action stays reachable while reading a
              long announcement on desktop. */}
          <Card className="lg:sticky lg:top-20">
            <CardHeader>
              <CardTitle>Apply</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <dl className="flex flex-col gap-3 text-sm">
                <Fact icon={<CalendarClock className="size-4" aria-hidden />} label="Deadline">
                  {opportunity.deadline
                    ? new Date(opportunity.deadline).toLocaleString("en-GB", {
                        dateStyle: "long",
                        timeStyle: "short",
                        timeZone: "Africa/Casablanca",
                      })
                    : "Rolling — no stated deadline"}
                </Fact>

                {opportunity.published_at && (
                  <Fact
                    icon={<CalendarDays className="size-4" aria-hidden />}
                    label="Published"
                  >
                    {new Date(opportunity.published_at).toLocaleDateString("en-GB", {
                      dateStyle: "long",
                    })}
                  </Fact>
                )}

                {opportunity.event_date && (
                  <Fact icon={<CalendarDays className="size-4" aria-hidden />} label="Exam date">
                    {new Date(opportunity.event_date).toLocaleDateString("en-GB", {
                      dateStyle: "long",
                    })}
                  </Fact>
                )}

                <Fact icon={<MapPin className="size-4" aria-hidden />} label="Location">
                  {opportunity.is_remote
                    ? "Remote"
                    : (opportunity.location_city ?? "Morocco — nationwide")}
                </Fact>

                {opportunity.positions_available != null && (
                  <Fact icon={<Users className="size-4" aria-hidden />} label="Positions">
                    {opportunity.positions_available}
                  </Fact>
                )}

                {opportunity.required_education_level && (
                  <Fact
                    icon={<GraduationCap className="size-4" aria-hidden />}
                    label="Education"
                  >
                    {EDUCATION_LABELS[opportunity.required_education_level]}
                  </Fact>
                )}

                {opportunity.languages_required.length > 0 && (
                  <Fact icon={<Languages className="size-4" aria-hidden />} label="Languages">
                    {opportunity.languages_required.join(", ")}
                  </Fact>
                )}
              </dl>

              <div className="flex flex-col gap-2">
                <Button asChild className="w-full">
                  <a
                    href={opportunity.application_link}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open the announcement
                    <ExternalLink />
                  </a>
                </Button>
                <BookmarkButton
                  opportunityId={opportunity.id}
                  bookmarked={saved.has(opportunity.id)}
                  signedIn={user !== null}
                />
              </div>

              <p className="text-xs leading-relaxed text-muted-foreground">
                Collected from{" "}
                <span className="font-medium text-foreground">{opportunity.source_key}</span> on{" "}
                {new Date(opportunity.discovered_at).toLocaleDateString("en-GB", {
                  dateStyle: "medium",
                })}
                . Always confirm the details on the issuing site before applying.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>

      {related.length > 0 && (
        <section className="flex flex-col gap-4 border-t border-border pt-8">
          <h2 className="text-lg font-semibold tracking-tight">
            More from this institution
          </h2>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((item: Opportunity) => (
              <li key={item.id} className="relative flex">
                <OpportunityCard
                  opportunity={item}
                  domainLabels={domainLabels}
                  signedIn={user !== null}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Fact({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="flex flex-col">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="font-medium">{children}</dd>
      </div>
    </div>
  );
}

/** The labels a "Label : value" block renders, for de-duplicating sections. */
function labelsIn(text: string | null): Set<string> {
  if (!text) return new Set();
  const labels = text
    .split("\n")
    .map((line) => {
      const index = line.indexOf(" : ");
      return index === -1 ? null : line.slice(0, index);
    })
    .filter((label): label is string => label !== null);
  return new Set(labels);
}

/**
 * Scrapers emit "Label : value" lines. Split them back apart when they
 * look that way, and fall back to plain paragraphs when they do not, so a
 * source that publishes prose still renders sensibly.
 */
function DefinitionList({ text }: { text: string }) {
  const lines = text.split("\n").filter(Boolean);
  const pairs = lines.map((line) => {
    const index = line.indexOf(" : ");
    return index === -1
      ? null
      : ([line.slice(0, index), line.slice(index + 3)] as [string, string]);
  });

  if (pairs.some((p) => p === null)) {
    return (
      <div className="flex flex-col gap-2 text-sm leading-relaxed" dir="auto">
        {lines.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    );
  }

  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {(pairs as [string, string][]).map(([label, value]) => (
        <div key={label} className="flex flex-col gap-0.5">
          <dt className="text-xs tracking-wide text-muted-foreground uppercase">{label}</dt>
          <dd className="text-sm break-words" dir="auto">{renderValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Sources sometimes put a URL in a value (a ministry's own deposit site). */
function renderValue(value: string) {
  if (!/^https?:\/\//i.test(value)) return value;
  return (
    <a
      href={value}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-4 hover:no-underline"
    >
      {value}
    </a>
  );
}
