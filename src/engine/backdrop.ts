import { PAL } from "../content/palette";
import { VIEW_H, VIEW_W } from "./canvas";

export type Mood = "cell" | "cloister" | "gallery" | "cistern" | "reliquary" | "sanctum";

interface MoodStyle {
  top: string;
  bottom: string;
  far: string;
  near: string;
  accent: string;
}

const STYLES: Record<Mood, MoodStyle> = {
  cell: { top: "#120c16", bottom: "#0a070d", far: "#1a1220", near: "#241a2c", accent: PAL.gold },
  cloister: { top: "#181022", bottom: "#0b0810", far: "#221631", near: "#2d1f3c", accent: PAL.goldPale },
  gallery: { top: "#1d1220", bottom: "#0d0810", far: "#291a2e", near: "#35223a", accent: PAL.ember },
  cistern: { top: "#0d1420", bottom: "#070a10", far: "#152130", near: "#1d2c3e", accent: PAL.fervour },
  reliquary: { top: "#1c1428", bottom: "#0c0812", far: "#2a1d3a", near: "#382848", accent: PAL.guiltPale },
  sanctum: { top: "#22101a", bottom: "#0b0509", far: "#33161f", near: "#421c26", accent: PAL.bloodBright },
};

/**
 * Parallax backdrop drawn from primitives: a vertical wash, two ranks of
 * pointed arches at different depths, and a vignette. Cheap, and it keeps the
 * rooms from reading as flat boxes.
 */
export function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  mood: Mood,
  camX: number,
  camY: number,
  time: number,
): void {
  const style = STYLES[mood];

  const gradient = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  gradient.addColorStop(0, style.top);
  gradient.addColorStop(1, style.bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  drawArcades(ctx, style.far, camX * 0.18, camY * 0.1, 96, 118, 34);
  drawArcades(ctx, style.near, camX * 0.42, camY * 0.24, 148, 150, 54);

  // Slow candle glow along the base of the near arcade.
  ctx.globalAlpha = 0.16 + Math.sin(time * 0.02) * 0.05;
  ctx.fillStyle = style.accent;
  ctx.fillRect(0, VIEW_H - 46, VIEW_W, 46);
  ctx.globalAlpha = 1;

  drawVignette(ctx);
}

function drawArcades(
  ctx: CanvasRenderingContext2D,
  color: string,
  offsetX: number,
  offsetY: number,
  spacing: number,
  height: number,
  width: number,
): void {
  ctx.fillStyle = color;
  const baseY = VIEW_H - 24 + offsetY * 0.4;
  const start = Math.floor(offsetX / spacing) - 1;
  const count = Math.ceil(VIEW_W / spacing) + 2;

  for (let i = 0; i < count; i++) {
    const x = Math.round((start + i) * spacing - offsetX);
    const top = Math.round(baseY - height);
    // Column body.
    ctx.fillRect(x, top + width / 2, width, height - width / 2);
    // Stepped pointed arch, drawn as shrinking rows.
    const steps = 7;
    for (let s = 0; s < steps; s++) {
      const inset = Math.round((s * (width / 2)) / steps);
      const rowH = Math.ceil(width / 2 / steps);
      ctx.fillRect(x + inset, top + s * rowH, width - inset * 2, rowH);
    }
  }
}

function drawVignette(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.32, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.85);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(4,2,6,0.72)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}
