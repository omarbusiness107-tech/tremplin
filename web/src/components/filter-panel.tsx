"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Search, SlidersHorizontal, X } from "lucide-react";

import { FilterChip } from "@/components/filter-chip";
import { Button } from "@/components/ui/button";
import type { Domain } from "@/lib/database.types";
import { TYPE_LABELS } from "@/lib/deadline";
import {
  type BrowseFilters,
  DEADLINE_WINDOWS,
  DEADLINE_WINDOW_LABELS,
  DEFAULT_FILTERS,
  OPPORTUNITY_TYPES,
  SORT_KEYS,
  SORT_LABELS,
  countActiveFilters,
  filtersToHref,
  toggleValue,
} from "@/lib/filters";
import type { CityFacet } from "@/lib/opportunities";
import { cn } from "@/lib/utils";

interface Props {
  filters: BrowseFilters;
  domains: Domain[];
  cities: CityFacet[];
}

export function FilterPanel({ filters, domains, cities }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const searchId = useId();

  const activeCount = countActiveFilters(filters);

  function apply(next: BrowseFilters) {
    // replace(), not push(): filter fiddling should not fill the back stack.
    startTransition(() => router.replace(filtersToHref(next, pathname), { scroll: false }));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchBox
          id={searchId}
          value={filters.q}
          pending={isPending}
          onChange={(q) => apply({ ...filters, q, page: 1 })}
        />

        <div className="flex items-center gap-2">
          <label htmlFor={`${searchId}-sort`} className="sr-only">
            Sort by
          </label>
          <select
            id={`${searchId}-sort`}
            value={filters.sort}
            onChange={(e) =>
              apply({ ...filters, sort: e.target.value as BrowseFilters["sort"], page: 1 })
            }
            className="h-9 rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {SORT_KEYS.map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="h-9"
          >
            <SlidersHorizontal />
            Filters
            {activeCount > 0 && (
              <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[10px] leading-4 text-primary-foreground tabular-nums">
                {activeCount}
              </span>
            )}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {OPPORTUNITY_TYPES.map((type) => (
          <FilterChip
            key={type}
            active={filters.types.includes(type)}
            onToggle={() => apply(toggleValue(filters, "types", type))}
          >
            {TYPE_LABELS[type]}
          </FilterChip>
        ))}
      </div>

      {expanded && (
        <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-4">
          <FilterGroup label="Deadline">
            {DEADLINE_WINDOWS.map((window) => (
              <FilterChip
                key={window}
                active={filters.within === window}
                onToggle={() =>
                  apply({
                    ...filters,
                    within: filters.within === window ? null : window,
                    page: 1,
                  })
                }
              >
                {DEADLINE_WINDOW_LABELS[window]}
              </FilterChip>
            ))}
            <FilterChip
              active={filters.includeClosed}
              onToggle={() =>
                apply({ ...filters, includeClosed: !filters.includeClosed, page: 1 })
              }
            >
              Include closed
            </FilterChip>
          </FilterGroup>

          <FilterGroup label="Field">
            {domains.map((domain) => (
              <FilterChip
                key={domain.slug}
                active={filters.domains.includes(domain.slug)}
                onToggle={() => apply(toggleValue(filters, "domains", domain.slug))}
              >
                {domain.label_en}
              </FilterChip>
            ))}
          </FilterGroup>

          {/* Hidden entirely until a source actually publishes city data —
              an empty filter is worse than no filter. */}
          {cities.length > 0 && (
            <FilterGroup label="City">
              {cities.map(({ city, opportunity_count }) => (
                <FilterChip
                  key={city}
                  active={filters.cities.includes(city)}
                  onToggle={() => apply(toggleValue(filters, "cities", city))}
                  count={opportunity_count}
                >
                  {city}
                </FilterChip>
              ))}
            </FilterGroup>
          )}
        </div>
      )}

      {activeCount > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {activeCount} filter{activeCount === 1 ? "" : "s"} active
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => apply({ ...DEFAULT_FILTERS, sort: filters.sort })}
          >
            <X />
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function SearchBox({
  id,
  value,
  pending,
  onChange,
}: {
  id: string;
  value: string;
  pending: boolean;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [lastApplied, setLastApplied] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adjust during render rather than in an effect: when the URL changes from
  // elsewhere (Clear all, the back button) the box should follow it.
  if (value !== lastApplied) {
    setLastApplied(value);
    setDraft(value);
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Debounced in the handler, not an effect: one navigation per pause in
  // typing rather than one per keystroke.
  function handleChange(next: string) {
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(next), 300);
  }

  return (
    <div className="relative flex-1">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <label htmlFor={id} className="sr-only">
        Search opportunities
      </label>
      <input
        id={id}
        type="search"
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Search title, institution, field…"
        className={cn(
          "h-9 w-full rounded-md border border-input bg-card pr-9 pl-9 text-sm",
          "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      />
      {pending && (
        <Loader2
          className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
          aria-hidden
        />
      )}
    </div>
  );
}
