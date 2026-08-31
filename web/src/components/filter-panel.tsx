"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Search, SlidersHorizontal, X } from "lucide-react";

import { FilterChip } from "@/components/filter-chip";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/i18n/dictionary";
import { plural } from "@/i18n/format";
import type { Domain } from "@/lib/database.types";
import {
  type BrowseFilters,
  DEADLINE_WINDOWS,
  DEFAULT_FILTERS,
  OPPORTUNITY_TYPES,
  SORT_KEYS,
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
  dict: Dictionary;
  /**
   * Slug -> label in the active locale, resolved on the server. Passing
   * the resolved map rather than the locale keeps this component from
   * needing to know how a domain label is chosen.
   */
  domainLabels: Record<string, string>;
}

export function FilterPanel({ filters, domains, cities, dict, domainLabels }: Props) {
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
    <div className="relative flex flex-col gap-4 border border-border-strong bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5">
      <div className="pointer-events-none absolute inset-y-0 start-0 w-1 bg-primary" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchBox
          id={searchId}
          value={filters.q}
          pending={isPending}
          placeholder={dict.filters.searchPlaceholder}
          label={dict.filters.searchLabel}
          onChange={(q) => apply({ ...filters, q, page: 1 })}
        />

        <div className="flex items-center gap-2">
          <label htmlFor={`${searchId}-sort`} className="sr-only">
            {dict.filters.sortBy}
          </label>
          <select
            id={`${searchId}-sort`}
            value={filters.sort}
            onChange={(e) =>
              apply({ ...filters, sort: e.target.value as BrowseFilters["sort"], page: 1 })
            }
            className="h-12 rounded-md border border-input bg-background px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {SORT_KEYS.map((key) => (
              <option key={key} value={key}>
                {dict.filters.sort[key]}
              </option>
            ))}
          </select>

          <Button
            variant="outline"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="h-12"
          >
            <SlidersHorizontal />
            {dict.filters.filters}
            {activeCount > 0 && (
              <span className="ms-0.5 rounded-sm bg-primary px-1.5 text-[10px] leading-4 text-primary-foreground tabular-nums">
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
            {dict.types[type]}
          </FilterChip>
        ))}
      </div>

      {expanded && (
        <div className="motion-enter origin-top flex flex-col gap-5 border-t border-border bg-surface-sunken/55 p-4">
          <FilterGroup label={dict.filters.groups.deadline}>
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
                {dict.filters.windows[window]}
              </FilterChip>
            ))}
            <FilterChip
              active={filters.includeClosed}
              onToggle={() =>
                apply({ ...filters, includeClosed: !filters.includeClosed, page: 1 })
              }
            >
              {dict.filters.windows.closed}
            </FilterChip>
          </FilterGroup>

          <FilterGroup label={dict.filters.groups.field}>
            {domains.map((domain) => (
              <FilterChip
                key={domain.slug}
                active={filters.domains.includes(domain.slug)}
                onToggle={() => apply(toggleValue(filters, "domains", domain.slug))}
              >
                <span dir="auto">{domainLabels[domain.slug] ?? domain.slug}</span>
              </FilterChip>
            ))}
          </FilterGroup>

          {/* Hidden entirely until a source actually publishes city data —
              an empty filter is worse than no filter. */}
          {cities.length > 0 && (
            <FilterGroup label={dict.filters.groups.city}>
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
            {plural(dict.filters.active, activeCount)}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => apply({ ...DEFAULT_FILTERS, sort: filters.sort })}
          >
            <X />
            {dict.filters.clearAll}
          </Button>
        </div>
      )}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[11px] font-semibold tracking-wide text-subtle-foreground uppercase">
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
  placeholder,
  label,
  onChange,
}: {
  id: string;
  value: string;
  pending: boolean;
  placeholder: string;
  label: string;
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

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

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
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground"
        aria-hidden
      />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="search"
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        dir="auto"
        className={cn(
          "h-12 w-full rounded-md border border-input bg-background pe-10 ps-10 text-sm",
          "placeholder:text-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      />
      {pending && (
        <Loader2
          className="absolute end-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-subtle-foreground"
          aria-hidden
        />
      )}
    </div>
  );
}
