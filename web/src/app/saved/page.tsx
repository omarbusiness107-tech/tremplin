import Link from "next/link";
import { redirect } from "next/navigation";
import { BookmarkX } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { OpportunityCard } from "@/components/opportunity-card";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { listBookmarks } from "@/lib/bookmarks";
import { daysUntil } from "@/lib/deadline";
import { listDomains } from "@/lib/opportunities";

export const metadata = { title: "Saved opportunities" };

export default async function SavedPage() {
  if (!(await getCurrentUser())) redirect("/login?next=/saved");

  const [saved, domains] = await Promise.all([listBookmarks(), listDomains()]);
  const domainLabels = new Map(domains.map((d) => [d.slug, d.label_en]));

  const closingSoon = saved.filter(({ opportunity }) => {
    const days = daysUntil(opportunity.deadline);
    return days !== null && days >= 0 && days <= 7;
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Saved</h1>
        <p className="text-sm text-muted-foreground">
          {saved.length === 0
            ? "Nothing saved yet."
            : `${saved.length} saved, soonest deadline first.`}
        </p>
      </header>

      {closingSoon.length > 0 && (
        <div className="rounded-xl border border-urgent/30 bg-urgent-muted/40 px-4 py-3 text-sm">
          <span className="font-medium">
            {closingSoon.length} of your saved{" "}
            {closingSoon.length === 1 ? "opportunity closes" : "opportunities close"} within
            a week.
          </span>{" "}
          <span className="text-muted-foreground">
            You will also get an email reminder — adjust the timing in your{" "}
            <Link href="/profile" className="underline underline-offset-4">
              profile
            </Link>
            .
          </span>
        </div>
      )}

      {saved.length === 0 ? (
        <EmptyState
          icon={<BookmarkX className="size-5" aria-hidden />}
          title="No saved opportunities"
          description="Save anything you are considering and it will show up here, with a reminder before it closes."
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href="/">Browse opportunities</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {saved.map(({ opportunity }) => (
            <li key={opportunity.id} className="relative flex">
              <OpportunityCard
                opportunity={opportunity}
                domainLabels={domainLabels}
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
