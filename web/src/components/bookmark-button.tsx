"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toggleBookmark } from "@/app/actions/bookmarks";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

interface Props {
  opportunityId: string;
  bookmarked: boolean;
  signedIn: boolean;
  locale: Locale;
  labels: { save: string; unsave: string };
  variant?: "button" | "glass";
  className?: string;
}

export function BookmarkButton({
  opportunityId,
  bookmarked,
  signedIn,
  locale,
  labels,
  variant = "button",
  className,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Flip immediately; the server action reconciles. A save that takes a
  // round trip to show feedback feels broken.
  const [optimistic, setOptimistic] = useOptimistic(bookmarked);

  function onClick() {
    if (!signedIn) {
      router.push(`/${locale}/login?next=/${locale}/opportunities/${opportunityId}`);
      return;
    }
    startTransition(async () => {
      setOptimistic(!optimistic);
      await toggleBookmark(opportunityId, optimistic);
    });
  }

  const label = optimistic ? labels.unsave : labels.save;
  const Icon = optimistic ? BookmarkCheck : Bookmark;

  if (variant === "glass") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        aria-label={label}
        aria-pressed={optimistic}
        className={cn(
          "grid size-9 place-items-center rounded-md bg-white/90 shadow-sm ring-1 ring-black/10 transition-[color,transform] duration-200 ease-out active:scale-[0.96]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          optimistic ? "text-primary" : "text-slate-600 hover:text-slate-900",
          className,
        )}
      >
        <Icon className="size-4" aria-hidden />
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      disabled={isPending}
      aria-pressed={optimistic}
      className={cn("w-full", className)}
    >
      <Icon />
      {label}
    </Button>
  );
}
