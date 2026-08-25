import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BookmarkX } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { OpportunityCard } from "@/components/opportunity-card";
import { Button } from "@/components/ui/button";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionary";
import { interpolate } from "@/i18n/format";
import { getCurrentUser } from "@/lib/auth";
import { listBookmarks } from "@/lib/bookmarks";
import { daysUntil, domainLabelMap } from "@/lib/labels";
import { listDomains } from "@/lib/opportunities";

export default async function SavedPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const typed = locale as Locale;

  if (!(await getCurrentUser())) redirect(`/${typed}/login?next=/${typed}/saved`);

  const [dict, saved, domains] = await Promise.all([
    getDictionary(typed),
    listBookmarks(),
    listDomains(),
  ]);
  const domainLabels = domainLabelMap(domains, typed);

  const closingSoon = saved.filter(({ opportunity }) => {
    const days = daysUntil(opportunity.deadline);
    return days !== null && days >= 0 && days <= 7;
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold sm:text-3xl">{dict.saved.title}</h1>
        <p className="text-sm text-muted-foreground">
          {saved.length === 0
            ? dict.saved.none
            : interpolate(dict.saved.count, { count: saved.length })}
        </p>
      </header>

      {closingSoon.length > 0 && (
        <div className="rounded-xl border border-urgent/25 bg-urgent-soft/50 px-4 py-3 text-sm">
          <span className="font-medium">
            {interpolate(dict.saved.closingSoon, { count: closingSoon.length })}
          </span>{" "}
          <span className="text-muted-foreground">
            {interpolate(dict.saved.reminderNote, { profileLink: "" })}
            <Link href={`/${typed}/profile`} className="underline underline-offset-4">
              {dict.saved.profileLink}
            </Link>
            .
          </span>
        </div>
      )}

      {saved.length === 0 ? (
        <EmptyState
          icon={<BookmarkX className="size-5" aria-hidden />}
          title={dict.saved.emptyTitle}
          description={dict.saved.emptyBody}
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href={`/${typed}`}>{dict.saved.emptyAction}</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {saved.map(({ opportunity }) => (
            <li key={opportunity.id} className="flex">
              <OpportunityCard
                opportunity={opportunity}
                domainLabels={domainLabels}
                locale={typed}
                dict={dict}
                bookmarked
                signedIn
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
