import type { ReactNode } from "react";

interface Props {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  /**
   * Stable, locale-independent identifier for the state being shown.
   * The deployment smoke test keys off this rather than the visible
   * copy, which is translated three ways and would otherwise have to be
   * duplicated there.
   */
  state?: "not-configured" | "load-error" | "empty-database" | "no-matches";
}

export function EmptyState({ icon, title, description, action, state }: Props) {
  return (
    <div
      data-empty-state={state}
      className="flex flex-col items-center rounded-xl border border-dashed border-border-strong bg-surface px-6 py-16 text-center"
    >
      <div className="mb-4 grid size-11 place-items-center rounded-full bg-secondary text-muted-foreground">
        {icon}
      </div>
      <h2 className="font-display text-base font-semibold">{title}</h2>
      <div className="mt-2 max-w-md text-sm text-balance text-muted-foreground">
        {description}
      </div>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
