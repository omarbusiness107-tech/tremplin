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
    <div className="pointer-events-none absolute inset-0 grid place-items-center p-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- see OpportunityCover */}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={cn(
          "max-h-[74%] rounded-lg bg-white/95 object-contain p-2 shadow-sm ring-1 ring-black/5",
          size === "hero" ? "max-w-[34%]" : "max-w-[58%]",
        )}
      />
    </div>
  );
}
