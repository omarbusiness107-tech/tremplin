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
  gradient: string;
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
    gradient: "from-sky-500 via-blue-700 to-indigo-950",
    accent: "bg-cyan-300",
    mark: "JOB",
  },
  internship: {
    icon: Rocket,
    gradient: "from-teal-400 via-emerald-700 to-slate-950",
    accent: "bg-lime-300",
    mark: "STAGE",
  },
  bachelor: {
    icon: BookOpenCheck,
    gradient: "from-amber-400 via-fuchsia-600 to-violet-950",
    accent: "bg-orange-200",
    mark: "BAC+3",
  },
  master: {
    icon: GraduationCap,
    gradient: "from-violet-500 via-indigo-700 to-slate-950",
    accent: "bg-fuchsia-300",
    mark: "BAC+5",
  },
  doctorat: {
    icon: Microscope,
    gradient: "from-cyan-400 via-blue-700 to-slate-950",
    accent: "bg-sky-200",
    mark: "PHD",
  },
  scholarship: {
    icon: Sparkles,
    gradient: "from-pink-400 via-purple-700 to-indigo-950",
    accent: "bg-yellow-200",
    mark: "BOURSE",
  },
  concours: {
    icon: Trophy,
    gradient: "from-amber-400 via-orange-600 to-red-950",
    accent: "bg-yellow-200",
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
  const rotation = (seed % 17) - 8;
  const x = 12 + (seed % 22);
  const y = 18 + ((seed >> 4) % 28);

  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative isolate overflow-hidden bg-gradient-to-br text-white",
        art.gradient,
        size === "card" ? "aspect-[16/8]" : "h-48 sm:h-56 lg:h-full lg:min-h-[22rem]",
        className,
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,rgba(255,255,255,0.34),transparent_32%),linear-gradient(120deg,transparent_25%,rgba(255,255,255,0.11)_25%,rgba(255,255,255,0.11)_26%,transparent_26%)]" />
      <div
        className={cn("absolute size-40 rounded-full opacity-30 blur-3xl", art.accent)}
        style={{ left: `${x}%`, top: `${y}%` }}
      />
      <div className="absolute -end-8 -bottom-16 size-52 rounded-full border-[28px] border-white/10" />
      <div className="absolute end-7 top-6 size-16 rotate-12 rounded-2xl border border-white/15 bg-white/5 backdrop-blur-sm" />

      <div
        className={cn(
          "absolute start-[13%] top-1/2 grid -translate-y-1/2 place-items-center rounded-[1.4rem] border border-white/25 bg-white/15 shadow-2xl backdrop-blur-md",
          size === "card" ? "size-16" : "size-24 sm:size-28",
        )}
        style={{ transform: `translateY(-50%) rotate(${rotation}deg)` }}
      >
        <Icon className={size === "card" ? "size-8" : "size-12 sm:size-14"} strokeWidth={1.5} />
      </div>

      <span
        className={cn(
          "absolute end-5 bottom-3 font-display font-bold tracking-[0.16em] text-white/20",
          size === "card" ? "text-2xl" : "text-4xl sm:text-6xl",
        )}
      >
        {art.mark}
      </span>

      {logoUrl && <InstitutionLogo src={logoUrl} size={size} />}
    </div>
  );
}
