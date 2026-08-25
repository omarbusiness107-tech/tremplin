import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-primary-soft text-primary-soft-foreground",
        outline: "border border-border text-muted-foreground",
        solid: "bg-primary text-primary-foreground",
        urgent: "bg-urgent-soft text-urgent",
        soon: "bg-soon-soft text-soon",
        calm: "bg-calm-soft text-calm",
        neutral: "bg-secondary text-muted-foreground",
        glass: "bg-white/85 text-slate-900 backdrop-blur-sm ring-1 ring-black/5",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
