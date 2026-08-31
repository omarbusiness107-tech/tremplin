import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowLeft,
  ArrowRight,
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
import { OpportunityCover } from "@/components/opportunity-cover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isLocale, isRtl, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionary";
import { formatDate, interpolate } from "@/i18n/format";
import { getCurrentUser } from "@/lib/auth";
import { bookmarkedIds } from "@/lib/bookmarks";
import type { Opportunity } from "@/lib/database.types";
import {
  URGENCY_TONE,
  deadlineLabel,
  domainLabelMap,
  educationLabel,
  locationLabel,
  typeLabel,
  urgencyOf,
} from "@/lib/labels";
import { getOpportunity, listDomains, relatedOpportunities } from "@/lib/opportunities";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const opportunity = await getOpportunity(id);
  if (!opportunity || !isLocale(locale)) return {};

  const dict = await getDictionary(locale as Locale);
  return {
    title: opportunity.title,
    description: opportunity.institution ?? dict.brand.tagline,
  };
}

export default async function OpportunityPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();

  const typed = locale as Locale;
  const opportunity = await getOpportunity(id);
  if (!opportunity) notFound();

  const [dict, domains, related, user, saved] = await Promise.all([
    getDictionary(typed),
    listDomains(),
    relatedOpportunities(opportunity),
    getCurrentUser(),
    bookmarkedIds([id]),
  ]);
  const domainLabels = domainLabelMap(domains, typed);

  const urgency = urgencyOf(opportunity.deadline);
  const BackIcon = isRtl(typed) ? ArrowRight : ArrowLeft;

  // "Conditions to apply" is drawn from the same label/value pairs, so
  // showing them again under Details would just repeat the card above.
  const shownInConditions = labelsIn(opportunity.conditions_to_apply);
  const attributes = Object.entries(opportunity.attributes ?? {}).filter(
    ([label]) => !shownInConditions.has(label),
  );

  return (
    <article className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href={`/${typed}`}
        className="mb-6 inline-flex w-fit items-center gap-1.5 rounded-sm text-sm font-semibold text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <BackIcon className="size-4" aria-hidden />
        {dict.detail.back}
      </Link>

      <header className="grid overflow-hidden border border-border-strong bg-surface shadow-[var(--shadow-lift)] lg:grid-cols-[0.78fr_1.22fr]">
        <OpportunityCover
          id={opportunity.id}
          type={opportunity.type}
          logoUrl={opportunity.institution_logo_url}
          size="hero"
        />

        <div className="relative flex flex-col justify-center gap-5 p-6 sm:p-9 lg:p-12">
          <p className="text-xs font-bold tracking-[0.16em] text-primary uppercase">05 / {dict.brand.name}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">{typeLabel(opportunity.type, dict)}</Badge>
            <Badge variant={URGENCY_TONE[urgency]}>
              <CalendarClock className="size-3.5" aria-hidden />
              {deadlineLabel(opportunity.deadline, dict, typed)}
            </Badge>
          </div>

          <h1
            className="relative max-w-4xl text-3xl leading-[1.08] font-bold text-balance sm:text-5xl"
            dir="auto"
          >
            {opportunity.title}
          </h1>

          {opportunity.institution && (
            <p
              className="flex items-center gap-2 text-muted-foreground"
              dir="auto"
            >
              <Building2 className="size-4 shrink-0" aria-hidden />
              {opportunity.institution}
            </p>
          )}

          <div className="flex flex-wrap gap-1.5">
            {opportunity.domains.map((slug) => (
              <Badge key={slug} variant="outline" dir="auto">
                {domainLabels.get(slug) ?? slug}
              </Badge>
            ))}
          </div>
        </div>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="flex flex-col gap-6">
          {opportunity.description && (
            <Section title={dict.detail.description}>
              <RichText text={opportunity.description} />
            </Section>
          )}

          {opportunity.conditions_to_apply && (
            <Section title={dict.detail.conditions}>
              <DefinitionList text={opportunity.conditions_to_apply} />
            </Section>
          )}

          {attributes.length > 0 && (
            <Section title={dict.detail.details}>
              <dl className="grid gap-3 sm:grid-cols-2">
                {attributes.map(([label, value]) => (
                  <div
                    key={label}
                    className={`flex flex-col gap-2 border-s-2 border-primary bg-surface-sunken/65 p-4 ${
                      value.length > 180 || value.includes("\n") ? "sm:col-span-2" : ""
                    }`}
                  >
                    <dt
                      className="text-[11px] font-medium tracking-wide text-subtle-foreground uppercase"
                      dir="auto"
                    >
                      {label}
                    </dt>
                    <dd className="text-sm leading-relaxed break-words" dir="auto">
                      {renderValue(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

        </div>

        <aside className="flex flex-col gap-4">
          {/* Sticky so the apply action stays reachable while reading a
              long announcement on desktop. */}
          <div className="border border-border-strong border-t-4 border-t-primary bg-surface p-5 shadow-[var(--shadow-card)] lg:sticky lg:top-24">
            <h2 className="font-display text-lg font-semibold">{dict.detail.apply}</h2>

            <dl className="mt-4 flex flex-col gap-3.5 text-sm">
              <Fact icon={<CalendarClock className="size-4" aria-hidden />} label={dict.detail.deadline}>
                {opportunity.deadline
                  ? formatDate(opportunity.deadline, typed, {
                      dateStyle: "long",
                      timeStyle: "short",
                      timeZone: "Africa/Casablanca",
                    })
                  : dict.deadline.rolling}
              </Fact>

              {opportunity.published_at && (
                <Fact icon={<CalendarDays className="size-4" aria-hidden />} label={dict.detail.published}>
                  {formatDate(opportunity.published_at, typed)}
                </Fact>
              )}

              {opportunity.event_date && (
                <Fact icon={<CalendarDays className="size-4" aria-hidden />} label={dict.detail.examDate}>
                  {formatDate(opportunity.event_date, typed)}
                </Fact>
              )}

              <Fact icon={<MapPin className="size-4" aria-hidden />} label={dict.detail.location}>
                <span dir="auto">{locationLabel(opportunity, dict)}</span>
              </Fact>

              {opportunity.positions_available != null && (
                <Fact icon={<Users className="size-4" aria-hidden />} label={dict.detail.positionsLabel}>
                  {opportunity.positions_available}
                </Fact>
              )}

              {opportunity.required_education_level && (
                <Fact icon={<GraduationCap className="size-4" aria-hidden />} label={dict.detail.education}>
                  {educationLabel(opportunity.required_education_level, dict)}
                </Fact>
              )}

              {opportunity.languages_required.length > 0 && (
                <Fact icon={<Languages className="size-4" aria-hidden />} label={dict.detail.languages}>
                  {opportunity.languages_required.join("، ")}
                </Fact>
              )}
            </dl>

            <div className="mt-5 flex flex-col gap-2">
              <Button asChild size="lg" className="w-full">
                <a
                  href={opportunity.application_link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {dict.detail.openAnnouncement}
                  <ExternalLink />
                </a>
              </Button>
              <BookmarkButton
                opportunityId={opportunity.id}
                bookmarked={saved.has(opportunity.id)}
                signedIn={user !== null}
                locale={typed}
                labels={{ save: dict.card.save, unsave: dict.card.unsave }}
              />
            </div>

            <p className="mt-4 text-xs leading-relaxed text-subtle-foreground">
              {interpolate(dict.detail.collectedFrom, {
                source: opportunity.source_key,
                date: formatDate(opportunity.discovered_at, typed, { dateStyle: "medium" }),
              })}
            </p>
          </div>
        </aside>
      </div>

      {related.length > 0 && (
        <section className="mt-10 flex flex-col gap-4 border-t border-border pt-8">
          <h2 className="font-display text-lg font-semibold" dir="auto">
            {dict.detail.moreFrom}
          </h2>
          <ul className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {related.map((item: Opportunity) => (
              <li key={item.id} className="flex min-w-0">
                <OpportunityCard
                  opportunity={item}
                  domainLabels={domainLabels}
                  locale={typed}
                  dict={dict}
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
    <section className="relative border border-border bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
      <h2 className="mb-5 flex items-center gap-3 font-display text-lg font-semibold">
        <span className="h-5 w-1 bg-primary" aria-hidden />
        {title}
      </h2>
      {children}
    </section>
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
    <div className="flex items-start gap-2.5 border-b border-border pb-3.5 last:border-b-0 last:pb-0">
      <span className="mt-0.5 text-subtle-foreground">{icon}</span>
      <div className="flex flex-col">
        <dt className="text-[11px] text-subtle-foreground">{label}</dt>
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
    return <RichText text={text} />;
  }

  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {(pairs as [string, string][]).map(([label, value]) => (
        <div key={label} className="flex flex-col gap-1">
          <dt
            className="text-[11px] font-medium tracking-wide text-subtle-foreground uppercase"
            dir="auto"
          >
            {label}
          </dt>
          <dd className="text-sm break-words" dir="auto">
            {renderValue(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Sources sometimes put a URL in a value (a ministry's own deposit site). */
function renderValue(value: string) {
  if (!/^https?:\/\//i.test(value)) return <RichText text={value} compact />;
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

/** Render the safe plain-text structure emitted by scrapers. */
function RichText({ text, compact = false }: { text: string; compact?: boolean }) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);

  return (
    <div className={compact ? "flex flex-col gap-1.5" : "flex flex-col gap-3 text-sm leading-7"} dir="auto">
      {lines.map((line, index) => {
        if (line.startsWith("## ")) {
          return (
            <h3 key={index} className="mt-3 font-display text-base font-semibold first:mt-0">
              {line.slice(3)}
            </h3>
          );
        }
        if (line.startsWith("• ")) {
          return (
            <div key={index} className="flex items-start gap-2.5">
              <span className="mt-[0.65em] size-1.5 shrink-0 rounded-full bg-primary" />
              <p>{line.slice(2)}</p>
            </div>
          );
        }
        return <p key={index}>{line}</p>;
      })}
    </div>
  );
}
