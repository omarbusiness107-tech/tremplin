import type { LucideIcon } from "lucide-react";
import {
  BookOpenCheck,
  BriefcaseBusiness,
  GraduationCap,
  Microscope,
  Rocket,
  Sparkles,
  Trophy,
} from "lucide-react";

import { InstitutionLogo } from "@/components/institution-logo";
import type { OpportunityType } from "@/lib/database.types";
import { cn } from "@/lib/utils";

interface Props {
  id: string;
  type: OpportunityType;
  logoUrl?: string | null;
  className?: string;
  size?: "card" | "hero";
}

type ArtDirection = {
  icon: LucideIcon;
  surface: string;
  ink: string;
  accent: string;
  mark: string;
};

/**
 * A real art direction for every category, not a blank fallback. Source
 * logos are layered on top when available, but the illustration remains
 * complete when a source publishes no image or a remote logo stops loading.
 */
const ART: Record<OpportunityType, ArtDirection> = {
  job: {
    icon: BriefcaseBusiness,
    surface: "bg-[#d9e5ff] dark:bg-[#1d3158]",
    ink: "text-[#17376f] dark:text-[#bdd0ff]",
    accent: "bg-[#3569d4]",
    mark: "JOB",
  },
  internship: {
    icon: Rocket,
    surface: "bg-[#d7eee4] dark:bg-[#193b32]",
    ink: "text-[#175b47] dark:text-[#a8ddca]",
    accent: "bg-[#1d8a67]",
    mark: "STAGE",
  },
  bachelor: {
    icon: BookOpenCheck,
    surface: "bg-[#f5e6bd] dark:bg-[#4a371c]",
    ink: "text-[#6d4a0e] dark:text-[#f2d58c]",
    accent: "bg-[#d18a1f]",
    mark: "BAC+3",
  },
  master: {
    icon: GraduationCap,
    surface: "bg-[#dfddff] dark:bg-[#2b285e]",
    ink: "text-[#3d3895] dark:text-[#c5c1ff]",
    accent: "bg-[#5147c9]",
    mark: "BAC+5",
  },
  doctorat: {
    icon: Microscope,
    surface: "bg-[#d7e9ec] dark:bg-[#173941]",
    ink: "text-[#1b5966] dark:text-[#a8dbe2]",
    accent: "bg-[#2b8192]",
    mark: "PHD",
  },
  scholarship: {
    icon: Sparkles,
    surface: "bg-[#f1dce7] dark:bg-[#4a2439]",
    ink: "text-[#84345e] dark:text-[#efb8d4]",
    accent: "bg-[#b54f7f]",
    mark: "BOURSE",
  },
  concours: {
    icon: Trophy,
    surface: "bg-[#f2ded0] dark:bg-[#4b2b1f]",
    ink: "text-[#8a3e20] dark:text-[#edb79f]",
    accent: "bg-[#c85b2d]",
    mark: "CONCOURS",
  },
};

/** FNV-1a gives each listing stable, slightly different artwork. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function OpportunityCover({ id, type, logoUrl, className, size = "card" }: Props) {
  const seed = hash(id);
  const art = ART[type];
  const Icon = art.icon;
  const index = String((seed % 89) + 11).padStart(2, "0");

  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative isolate overflow-hidden border-border",
        art.surface,
        art.ink,
        size === "card"
          ? "h-40 border-b sm:h-full sm:min-h-64 sm:border-e sm:border-b-0"
          : "h-56 border-b sm:h-72 lg:h-full lg:min-h-[30rem] lg:border-e lg:border-b-0",
        className,
      )}
    >
      <div className="absolute inset-y-0 start-1/2 w-px bg-current opacity-20" />
      <div className="absolute inset-x-0 top-1/2 h-px bg-current opacity-20" />
      <div className={cn("absolute inset-y-0 start-0 w-1.5", art.accent)} />
      <span className="absolute end-4 top-3 font-display text-[11px] font-bold tracking-[0.18em] opacity-65">
        {index}
      </span>
      <div className="absolute start-5 top-5 flex items-center gap-2 text-[10px] font-bold tracking-[0.14em] uppercase opacity-75">
        <span className={cn("size-2", art.accent)} />
        {art.mark}
      </div>

      <div className="absolute inset-0 grid place-items-center">
        <div className={cn(
          "grid place-items-center border-2 border-current bg-white/45 shadow-[5px_5px_0_currentColor] dark:bg-black/15",
          size === "card" ? "size-16" : "size-24 sm:size-28",
        )}>
          <Icon className={size === "card" ? "size-8" : "size-12 sm:size-14"} strokeWidth={1.6} />
        </div>
      </div>

      {logoUrl && <InstitutionLogo src={logoUrl} size={size} />}
    </div>
  );
}
