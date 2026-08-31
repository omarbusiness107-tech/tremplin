"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * The institution logo laid over a cover.
 *
 * A client component for one reason: a remote image that fails is only
 * discoverable at runtime, and without handling it the white plate this
 * draws would still render around nothing — a small blank chip stamped
 * on the artwork. On error it removes itself and the generated zellij
 * panel behind it is simply what you see.
 *
 * alt="" because the logo is decorative: the institution name is already
 * set in text next to it, so announcing it twice helps nobody.
 */
export function InstitutionLogo({ src, size }: { src: string; size: "card" | "hero" }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center p-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- see OpportunityCover */}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={cn(
          "max-h-[72%] bg-white object-contain p-3 shadow-[5px_5px_0_rgba(17,24,39,0.18)] ring-1 ring-black/10",
          size === "hero" ? "max-w-[42%]" : "max-w-[68%]",
        )}
      />
    </div>
  );
}
