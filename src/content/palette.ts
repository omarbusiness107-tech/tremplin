/**
 * A deliberately small, desaturated palette: cold stone, dried blood, candle
 * gold. Everything in the game draws from this so new content stays coherent.
 */
export const PAL = {
  void: "#07050a",
  bgFar: "#100b14",
  bgMid: "#181120",
  bgNear: "#20172a",

  stoneDark: "#2b2130",
  stone: "#3d2f42",
  stoneLit: "#584764",
  stoneEdge: "#6d5878",

  blood: "#8a1c2b",
  bloodBright: "#c8362f",
  ember: "#e0703a",
  gold: "#d9a441",
  goldPale: "#f0d18a",

  bone: "#e6dac4",
  boneDim: "#b4a68c",
  flesh: "#9c7256",

  cloth: "#6b2d3b",
  clothLit: "#8f4050",
  clothDark: "#3a1620",

  fervour: "#4f9dd4",
  fervourPale: "#a8d8f2",

  guilt: "#7d5fa8",
  guiltPale: "#c3a8e0",

  ui: "#ded3bd",
  uiDim: "#7b6f63",
  danger: "#d0453a",
} as const;

export type PaletteKey = keyof typeof PAL;
