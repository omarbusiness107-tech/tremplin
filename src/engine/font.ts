/**
 * A hand-authored 5x7 bitmap font. Uppercase only, which suits the liturgical
 * tone and halves the glyph count. Rows are '#' (lit) and '.' (clear).
 */
const GLYPHS: Record<string, string> = {
  A: ".###./#...#/#...#/#####/#...#/#...#/#...#",
  B: "####./#...#/#...#/####./#...#/#...#/####.",
  C: ".###./#...#/#..../#..../#..../#...#/.###.",
  D: "####./#...#/#...#/#...#/#...#/#...#/####.",
  E: "#####/#..../#..../####./#..../#..../#####",
  F: "#####/#..../#..../####./#..../#..../#....",
  G: ".###./#...#/#..../#.###/#...#/#...#/.###.",
  H: "#...#/#...#/#...#/#####/#...#/#...#/#...#",
  I: "#####/..#../..#../..#../..#../..#../#####",
  J: "..###/...#./...#./...#./...#./#..#./.##..",
  K: "#...#/#..#./#.#../##.../#.#../#..#./#...#",
  L: "#..../#..../#..../#..../#..../#..../#####",
  M: "#...#/##.##/#.#.#/#...#/#...#/#...#/#...#",
  N: "#...#/##..#/#.#.#/#..##/#...#/#...#/#...#",
  O: ".###./#...#/#...#/#...#/#...#/#...#/.###.",
  P: "####./#...#/#...#/####./#..../#..../#....",
  Q: ".###./#...#/#...#/#...#/#.#.#/#..#./.##.#",
  R: "####./#...#/#...#/####./#.#../#..#./#...#",
  S: ".####/#..../#..../.###./....#/....#/####.",
  T: "#####/..#../..#../..#../..#../..#../..#..",
  U: "#...#/#...#/#...#/#...#/#...#/#...#/.###.",
  V: "#...#/#...#/#...#/#...#/#...#/.#.#./..#..",
  W: "#...#/#...#/#...#/#...#/#.#.#/##.##/#...#",
  X: "#...#/#...#/.#.#./..#../.#.#./#...#/#...#",
  Y: "#...#/#...#/.#.#./..#../..#../..#../..#..",
  Z: "#####/....#/...#./..#../.#.../#..../#####",
  "0": ".###./#...#/#..##/#.#.#/##..#/#...#/.###.",
  "1": "..#../.##../..#../..#../..#../..#../.###.",
  "2": ".###./#...#/....#/...#./..#../.#.../#####",
  "3": "####./....#/....#/.###./....#/....#/####.",
  "4": "...#./..##./.#.#./#..#./#####/...#./...#.",
  "5": "#####/#..../####./....#/....#/#...#/.###.",
  "6": "..##./.#.../#..../####./#...#/#...#/.###.",
  "7": "#####/....#/...#./..#../.#.../.#.../.#...",
  "8": ".###./#...#/#...#/.###./#...#/#...#/.###.",
  "9": ".###./#...#/#...#/.####/....#/...#./.##..",
  " ": "...../...../...../...../...../...../.....",
  ".": "...../...../...../...../...../.##../.##..",
  ",": "...../...../...../...../.##../.##../.#...",
  "!": "..#../..#../..#../..#../..#../...../..#..",
  "?": ".###./#...#/....#/..##./..#../...../..#..",
  ":": "...../.##../.##../...../.##../.##../.....",
  "'": "..#../..#../...../...../...../...../.....",
  '"': ".#.#./.#.#./...../...../...../...../.....",
  "-": "...../...../...../.###./...../...../.....",
  "+": "...../..#../..#../#####/..#../..#../.....",
  "=": "...../...../#####/...../#####/...../.....",
  "/": "....#/...#./...#./..#../.#.../.#.../#....",
  "(": "...#./..#../.#.../.#.../.#.../..#../...#.",
  ")": ".#.../..#../...#./...#./...#./..#../.#...",
  "%": "#...#/#...#/...#./..#../.#.../#...#/#...#",
  "<": "...#./..#../.#.../#..../.#.../..#../...#.",
  ">": ".#.../..#../...#./....#/...#./..#../.#...",
  "*": "...../#.#.#/.###./#####/.###./#.#.#/.....",
};

export const GLYPH_W = 5;
export const GLYPH_H = 7;
/** One blank column between glyphs. */
export const CHAR_ADVANCE = GLYPH_W + 1;

const MISSING = GLYPHS["?"];

/** Rendered-text cache; keyed by content, colour and scale. */
const cache = new Map<string, HTMLCanvasElement>();
const CACHE_LIMIT = 400;

export function textWidth(text: string, scale = 1): number {
  if (text.length === 0) return 0;
  return (text.length * CHAR_ADVANCE - 1) * scale;
}

export function textHeight(scale = 1): number {
  return GLYPH_H * scale;
}

function renderToCanvas(text: string, color: string, scale: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, textWidth(text, scale));
  canvas.height = GLYPH_H * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color;

  for (let i = 0; i < text.length; i++) {
    const glyph = GLYPHS[text[i]] ?? MISSING;
    const originX = i * CHAR_ADVANCE * scale;
    let row = 0;
    let col = 0;
    for (let c = 0; c < glyph.length; c++) {
      const ch = glyph[c];
      if (ch === "/") {
        row++;
        col = 0;
        continue;
      }
      if (ch === "#") ctx.fillRect(originX + col * scale, row * scale, scale, scale);
      col++;
    }
  }
  return canvas;
}

function glyphCanvas(text: string, color: string, scale: number): HTMLCanvasElement {
  const key = `${scale}|${color}|${text}`;
  let canvas = cache.get(key);
  if (!canvas) {
    canvas = renderToCanvas(text, color, scale);
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(key, canvas);
  }
  return canvas;
}

export type TextAlign = "left" | "center" | "right";

export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  scale = 1,
  align: TextAlign = "left",
): void {
  const upper = text.toUpperCase();
  if (upper.trim().length === 0) return;
  const w = textWidth(upper, scale);
  const drawX = align === "center" ? Math.round(x - w / 2) : align === "right" ? Math.round(x - w) : Math.round(x);
  ctx.drawImage(glyphCanvas(upper, color, scale), drawX, Math.round(y));
}

/** Text with a 1px drop shadow, for readability over busy backgrounds. */
export function drawTextShadow(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  scale = 1,
  align: TextAlign = "left",
  shadow = "#07050a",
): void {
  drawText(ctx, text, x + scale, y + scale, shadow, scale, align);
  drawText(ctx, text, x, y, color, scale, align);
}
