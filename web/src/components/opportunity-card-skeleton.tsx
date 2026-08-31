import { Skeleton } from "@/components/ui/skeleton";

export function OpportunityCardSkeleton() {
  return (
    <div
      aria-hidden
      className="grid h-full overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow-card)] sm:grid-cols-[11rem_minmax(0,1fr)]"
    >
      <Skeleton className="h-40 rounded-none sm:h-full sm:min-h-64" />
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-5">
        <Skeleton className="h-5 w-20 rounded-md" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3 w-2/3" />
        <div className="flex gap-1.5 pt-1">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="mt-auto border-t border-border pt-3">
          <Skeleton className="h-5 w-28 rounded-md" />
        </div>
      </div>
    </div>
  );
}
