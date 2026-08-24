"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toggleBookmark } from "@/app/actions/bookmarks";
import { cn } from "@/lib/utils";

interface Props {
  opportunityId: string;
  bookmarked: boolean;
  signedIn: boolean;
  variant?: "button" | "icon";
  className?: string;
}

export function BookmarkButton({
  opportunityId,
  bookmarked,
  signedIn,
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
      router.push(`/login?next=/opportunities/${opportunityId}`);
      return;
    }
    startTransition(async () => {
      setOptimistic(!optimistic);
      await toggleBookmark(opportunityId, optimistic);
    });
  }

  const label = optimistic ? "Remove from saved" : "Save this opportunity";
  const Icon = optimistic ? BookmarkCheck : Bookmark;

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        aria-label={label}
        aria-pressed={optimistic}
        className={cn(
          "inline-flex size-8 items-center justify-center rounded-md transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          optimistic
            ? "text-primary hover:bg-primary/10"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground",
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
      {optimistic ? "Saved" : "Save"}
    </Button>
  );
}
