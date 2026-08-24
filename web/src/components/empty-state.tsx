import type { ReactNode } from "react";

interface Props {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        {icon}
      </div>
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-1.5 max-w-md text-sm text-balance text-muted-foreground">
        {description}
      </div>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
