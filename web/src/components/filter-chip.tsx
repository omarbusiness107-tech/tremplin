"use client";

import { cn } from "@/lib/utils";

interface Props {
  active: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  count?: number;
}

/**
 * A toggle chip. Chips rather than dropdowns on purpose: every option and
 * its selected state stays visible, which works better on a phone than a
 * popover the user has to open to see what they picked.
 */
export function FilterChip({ active, onToggle, children, count }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:border-foreground/25 hover:text-foreground",
      )}
    >
      {children}
      {count !== undefined && (
        <span className={cn("tabular-nums", active ? "opacity-80" : "opacity-60")}>{count}</span>
      )}
    </button>
  );
}
