import { InstitutionLogo } from "@/components/institution-logo";
import type { OpportunityType } from "@/lib/database.types";
import { cn } from "@/lib/utils";

/**
 * The visual for one listing.
 *
 * Every card gets a generated zellij panel — the interlaced eight-point
 * star (khatim) of Moroccan tilework — coloured by opportunity type and
 * varied per listing by a hash of its id. Where the source published a
 * real logo it sits on top, on a plate; where it did not, or where the
 * remote image fails to load (see InstitutionLogo), the panel is simply
 * what you see. That is the point of drawing it rather than shipping a
 * placeholder graphic: there is no broken state, and no listing looks
 * like a gap in the grid.
 *
 * Inline SVG with a <pattern>, so it costs one element, no request, and
 * no layout shift.
 */

interface Props {
  id: string;
  type: OpportunityType;
  logoUrl?: string | null;
  className?: string;
  /** Detail pages give it more room and a taller crop. */
  size?: "card" | "hero";
}

/** Hue per type, spaced far enough apart to tell apart at a glance. */
const TYPE_HUE: Record<OpportunityType, number> = {
  concours: 277, // Majorelle — the house colour, and the largest category
  job: 205, // a cooler blue
  internship: 190, // teal
  scholarship: 300, // violet
  master: 262,
  doctorat: 250,
  bachelor: 285,
};

/** FNV-1a. Small, stable, and enough spread for four buckets. */
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
  const hue = TYPE_HUE[type] ?? 277;
  const variant = seed % 4;
  // Small per-listing drift so a grid of one type is not four identical
  // panels, without letting any card fall outside the palette.
  const shift = ((seed >> 4) % 14) - 7;
  const scale = [26, 32, 38, 44][variant];
  const patternId = `zellij-${id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12)}-${variant}`;

  const base = `oklch(0.62 0.15 ${hue + shift})`;
  const deep = `oklch(0.42 0.17 ${hue + shift})`;
  const light = `oklch(0.86 0.07 ${hue + shift})`;

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-surface-sunken",
        // The card keeps a ratio so a grid of them stays on a baseline.
        // The hero is a fixed band instead: at full page width a ratio
        // would make it several hundred pixels of pattern before the
        // title, which is decoration crowding out the content.
        size === "card" ? "aspect-[16/7]" : "h-32 sm:h-40",
        className,
      )}
    >
      <svg
        aria-hidden="true"
        className="absolute inset-0 size-full"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern
            id={patternId}
            width={scale}
            height={scale}
            patternUnits="userSpaceOnUse"
            patternTransform={`rotate(${variant * 15})`}
          >
            <rect width={scale} height={scale} fill={light} />
            {/* The khatim: two overlaid squares, one rotated 45°, which
                is how the eight-point star is actually struck out on a
                zellij board. */}
            <g
              fill="none"
              stroke={base}
              strokeWidth="1.15"
              transform={`translate(${scale / 2} ${scale / 2})`}
            >
              <rect
                x={-scale * 0.27}
                y={-scale * 0.27}
                width={scale * 0.54}
                height={scale * 0.54}
              />
              <rect
                x={-scale * 0.27}
                y={-scale * 0.27}
                width={scale * 0.54}
                height={scale * 0.54}
                transform="rotate(45)"
              />
              <circle r={scale * 0.09} fill={deep} stroke="none" />
            </g>
            {/* Corner quarter-stars, so tiles interlock across the seam
                the way real tilework does. */}
            <g fill={base} opacity="0.28">
              <circle cx="0" cy="0" r={scale * 0.07} />
              <circle cx={scale} cy="0" r={scale * 0.07} />
              <circle cx="0" cy={scale} r={scale * 0.07} />
              <circle cx={scale} cy={scale} r={scale * 0.07} />
            </g>
          </pattern>

          <linearGradient id={`${patternId}-veil`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={deep} stopOpacity="0.06" />
            <stop offset="100%" stopColor={deep} stopOpacity="0.22" />
          </linearGradient>
        </defs>

        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
        <rect width="100%" height="100%" fill={`url(#${patternId}-veil)`} />
      </svg>

      {logoUrl && <InstitutionLogo src={logoUrl} size={size} />}
    </div>
  );
}
