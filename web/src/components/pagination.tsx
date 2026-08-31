import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { type BrowseFilters, filtersToHref } from "@/lib/filters";
import { cn } from "@/lib/utils";

interface Props {
  filters: BrowseFilters;
  pageCount: number;
  pathname?: string;
}

/**
 * Plain links, not buttons: pagination is navigation, so it should work
 * without JavaScript and be openable in a new tab.
 */
export function Pagination({ filters, pageCount, pathname = "/" }: Props) {
  if (pageCount <= 1) return null;

  const { page } = filters;
  const pages = pageWindow(page, pageCount);

  return (
    <nav className="flex items-center justify-center gap-1" aria-label="Pagination">
      <PageLink
        href={filtersToHref({ ...filters, page: page - 1 }, pathname)}
        disabled={page <= 1}
        label="Previous page"
      >
        <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
      </PageLink>

      {pages.map((entry, index) =>
        entry === "gap" ? (
          <span key={`gap-${index}`} className="px-1 text-sm text-muted-foreground">
            …
          </span>
        ) : (
          <Link
            key={entry}
            href={filtersToHref({ ...filters, page: entry }, pathname)}
            aria-current={entry === page ? "page" : undefined}
            className={cn(
              "inline-flex h-10 min-w-10 items-center justify-center rounded-md px-2 text-sm font-semibold tabular-nums transition-[background-color,color,transform] duration-200 ease-out active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring",
              entry === page
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {entry}
          </Link>
        ),
      )}

      <PageLink
        href={filtersToHref({ ...filters, page: page + 1 }, pathname)}
        disabled={page >= pageCount}
        label="Next page"
      >
        <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
      </PageLink>
    </nav>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const className =
    "inline-flex size-10 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform] duration-200 ease-out active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring";

  if (disabled) {
    return (
      <span aria-hidden className={cn(className, "opacity-30")}>
        {children}
      </span>
    );
  }

  return (
    <Link href={href} aria-label={label} className={cn(className, "hover:bg-secondary hover:text-foreground")}>
      {children}
    </Link>
  );
}

/** First, last, and a window around the current page. */
function pageWindow(page: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);

  const window = new Set<number>([1, pageCount, page]);
  for (const offset of [-1, 1]) {
    const candidate = page + offset;
    if (candidate > 1 && candidate < pageCount) window.add(candidate);
  }

  const sorted = [...window].sort((a, b) => a - b);
  const result: (number | "gap")[] = [];
  let previous = 0;
  for (const value of sorted) {
    if (previous && value - previous > 1) result.push("gap");
    result.push(value);
    previous = value;
  }
  return result;
}
