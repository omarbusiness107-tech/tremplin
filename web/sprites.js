/* Sprite atlas for Ember Depths.

   Every sprite is a 16x16 grid of palette letters, painted into an offscreen
   canvas once at start-up and then blitted. No image files: the art is the
   source, so it can be edited in place a pixel at a time.

   '.' is transparent. Silhouette does the work at this size — each creature has
   a distinct outline before colour is considered. */

const TILE = 16;

const PALETTE = {
  k: "#0C0E14", // outline
  b: "#171B26", // deep shadow
  // stone
  s: "#2B3140", S: "#3A4254", t: "#4A5468", T: "#5D6980", u: "#727E96",
  // floor stone — deliberately low contrast so tiles read as one surface
  q1: "#2F3644", q2: "#343C4C", q3: "#3A4354", q4: "#272D3A",
  // mortar / grit
  m: "#232836", g: "#414A5E",
  // wood + leather
  w: "#4A3524", W: "#6E4E32", l: "#8A6A3E", L: "#B08A50",
  // gold + fire
  o: "#B8752A", O: "#D89A46", f: "#F0C978", F: "#FFE9A8",
  // flesh
  n: "#C9A07A", N: "#E4C39A",
  // cloak (hero)
  c: "#2E3A57", C: "#42557E", d: "#5B72A6",
  // metal
  e: "#6E7686", E: "#B9C2D4", i: "#E8EDF7",
  // reds
  r: "#7E3129", R: "#C2534A", q: "#E88A72",
  // greens
  h: "#2F5A2C", H: "#5D9A42", j: "#8FC963",
  // magenta (ogre)
  p: "#7A3560", P: "#C05F92", y: "#E894BE",
  // violet (wraith)
  v: "#3B2F63", V: "#8571C6", x: "#C4B6F2",
  // misc
  z: "#D8D2C2", Z: "#F2EEE0",
  a: "#272D3A", b: "#333B4A", c: "#3C4557"
};

/* ---------------- floors ---------------- */
/* Three flagstone variants so a room does not tile visibly. Mortar runs along
   the top and left so the light reads as coming from above. */
const FLOOR_A = [
  "aaaaaaaaaaaaaaaa",
  "abbbbbbbbbbbbbba",
  "abbbcbbbbbbbbbba",
  "abbbbbbbbbbcbbba",
  "abbbbbbbbbbbbbba",
  "aaaaaaaaaaaaaaaa",
  "abbbbbbbbbbbbbba",
  "abbcbbbbbbbbbbba",
  "abbbbbbbbbbbbcba",
  "abbbbbbbbbbbbbba",
  "aaaaaaaaaaaaaaaa",
  "abbbbbbbbbbbbbba",
  "abbbcbbbbbbbbbba",
  "abbbbbbbbbcbbbba",
  "abbbbbbbbbbbbbba",
  "aaaaaaaaaaaaaaaa"
];
const FLOOR_B = [
  "aaaaaaaaaaaaaaaa",
  "abbbbbbbbabbbbbb",
  "abbbcbbbbabbbbbb",
  "abbbbbbbbabbcbbb",
  "abbbbbbbbabbbbbb",
  "abbbbbbbbabbbbbb",
  "aaaaaaaaaaaaaaaa",
  "abbbbbbbbbbbbbba",
  "abbcbbbbbbbbbcba",
  "abbbbbbbbbbbbbba",
  "abbbbbbcbbbbbbba",
  "aaaaaaaaaaaaaaaa",
  "abbbbbbbbabbbbbb",
  "abbbcbbbbabbbbbb",
  "abbbbbbbbabbbbcb",
  "aaaaaaaaaaaaaaaa"
];
const FLOOR_C = [
  "aaaaaaaaaaaaaaaa",
  "abbbbbbbbbbbbbba",
  "abbbbbbcbbbbbbba",
  "abbcbbbbbbbbbbba",
  "aaaaaaaaaaaaaaaa",
  "abbbbbbbbbbbbbba",
  "abbbbbbbbbbbcbba",
  "abbbcbbbbbbbbbba",
  "abbbbbbbbbbbbbba",
  "aaaaaaaaaaaaaaaa",
  "abbbbbbbbbbbbbba",
  "abbbbcbbbbbbbbba",
  "abbbbbbbbbbbbcba",
  "abbbbbbbbbbbbbba",
  "abbbcbbbbbbbbbba",
  "aaaaaaaaaaaaaaaa"
];

/* ---------------- walls ---------------- */
/* WALL_FACE is drawn where a wall has open ground below it: coursed blocks with
   a lit cap along the top, which is what gives the map its sense of depth.
   WALL_TOP is the flat rock behind it. */
const WALL_FACE = [
  "uuuuuuuuuuuuuuuu",
  "TTTTTTTTTTTTTTTT",
  "mmmmmmmmmmmmmmmm",
  "sSSSSSsSSSSSSSSs",
  "sSSSSSsSSSSSSSSs",
  "sSSsSSsSSSSSsSSs",
  "mmmmmmmmmmmmmmmm",
  "SSSSsSSSSSsSSSSS",
  "SSSSsSSSSSsSSSSS",
  "SSsSsSSsSSsSSSSS",
  "mmmmmmmmmmmmmmmm",
  "sSSSSSSSSsSSSSSs",
  "sSSSSSSSSsSSSSSs",
  "sSSsSSSSSsSSsSSs",
  "mmmmmmmmmmmmmmmm",
  "bbbbbbbbbbbbbbbb"
];
const WALL_TOP = [
  "ssssssssssssssss",
  "smmsssssmsssssss",
  "ssssssssssssssss",
  "sssssmssssssmsss",
  "ssmsssssssssssss",
  "ssssssssmsssssss",
  "sssssssssssmssss",
  "smsssssssssssssm",
  "ssssssmsssssssss",
  "sssssssssssssmss",
  "ssmssssssmssssss",
  "ssssssssssssssss",
  "sssmssssssssmsss",
  "ssssssssmsssssss",
  "smsssssssssssmss",
  "ssssssssssssssss"
];

/* ---------------- features ---------------- */
const SPR_DOOR = [
  "................",
  "kkkkkkkkkkkkkkkk",
  "kWWWWWWWWWWWWWWk",
  "kWwwwwwwwwwwwwWk",
  "kWwLLwLLwLLwwwWk",
  "kWwLlwLlwLlwwwWk",
  "kWwLlwLlwLlwwwWk",
  "kWwLlwLlwLlwOwWk",
  "kWwLlwLlwLlwfwWk",
  "kWwLlwLlwLlwwwWk",
  "kWwLlwLlwLlwwwWk",
  "kWwLlwLlwLlwwwWk",
  "kWwwwwwwwwwwwwWk",
  "kWWWWWWWWWWWWWWk",
  "kkkkkkkkkkkkkkkk",
  "................"
];
const SPR_STAIRS = [
  "kkkkkkkkkkkkkkkk",
  "kbbbbbbbbbbbbbbk",
  "kbTTTTTTTTTTTTbk",
  "kbSSSSSSSSSSSSbk",
  "kbbbbbbbbbbbbbbk",
  "kkbTTTTTTTTTTbkk",
  "kkbSSSSSSSSSSbkk",
  "kkbbbbbbbbbbbbkk",
  "kkkbTTTTTTTTbkkk",
  "kkkbSSSSSSSSbkkk",
  "kkkbbbbbbbbbbkkk",
  "kkkkbTTTTTTbkkkk",
  "kkkkbSSSSSSbkkkk",
  "kkkkbbbbbbbbkkkk",
  "kkkkkbbbbbbkkkkk",
  "kkkkkkbbbbkkkkkk"
];

/* ---------------- the hero ---------------- */
/* A hooded figure with a lit blade. The hood and shoulders make the silhouette
   read as a person even at a single tile. */
const HERO = [
  "................",
  "......kkkk......",
  ".....kccCck.....",
  "....kcCCCCck....",
  "....kcbnnbck....",
  "....kcnnnnck....",
  "....kcnkknck....",
  ".....kcnnck.....",
  "....kkCCCCkk....",
  "...kCCdddCCk.Ek.",
  "..kcCCdddCCck Ek",
  "..kcCCCCCCck.Ek.",
  "..kkcCCCCckk.ek.",
  "....kcCCck..lk..",
  "....kwk kwk.....",
  "...kkk   kkk...."
];

/* ---------------- monsters ---------------- */
const RAT = [
  "................",
  "................",
  "................",
  "..........kk....",
  "....kk...kkWWk..",
  ".kkkWWkkkWWWWk..",
  "kWnnWWWWWWWWk...",
  "kWnkWWWWWWWWWkk.",
  "kWnWWWWWWWWWWWWk",
  "kkWWWWWWWWWWWWWk",
  ".kWWWWWWWWWWWkk.",
  "..kWkkWkkWkkWk..",
  "...kk.kk.kk.kk..",
  "................",
  "................",
  "................"
];
const GOBLIN = [
  "................",
  "................",
  "..k..........k..",
  "..kk...kkk..kk..",
  "..khkkkHHHkkkhk.",
  "...kHHHHHHHHHk..",
  "...kHHkHHkHHHk..",
  "...kHHHHHHHHHk..",
  "....kHqqqqHHk...",
  ".....kkHHHkk....",
  "...kkHHHHHHHkk..",
  "..kHHkHHHHHkHHk.",
  "..kHkkkHHHkkkHk.",
  "...k..kHHHk..k..",
  "......kHkHk.....",
  ".....kkk.kkk...."
];
const ORC = [
  "................",
  "................",
  "....kkkkkkkk....",
  "...kRRRRRRRRk...",
  "...kRkRRRRkRk...",
  "...kRRRRRRRRk...",
  "...kRqRRRRqRk...",
  "...kRRRRRRRRk...",
  "...kZRRRRRRZk...",
  "...kkRRRRRRkk...",
  "..kRRRRRRRRRRk..",
  ".kRRRRRRRRRRRRk.",
  "kEkRRkRRRRkRRkEk",
  "kEk.kRRkkRRk.kEk",
  ".k..kRRk kRRk..k",
  "....kkk   kkk..."
];
const OGRE = [
  "................",
  ".....kkkkkk.....",
  "....kPPPPPPk....",
  "....kPkPPkPk....",
  "....kPPPPPPk....",
  "....kPZPPZPk....",
  "..kkkPPPPPPkkk..",
  ".kPPPPPPPPPPPPk.",
  "kPPPPPPPPPPPPPPk",
  "kPPPPPPPPPPPPPPk",
  "kPPPkPPPPPPkPPPk",
  "kPPkkPPPPPPkkPPk",
  "kkPk.kPPPPk.kPkk",
  ".kk..kPPPPk..kk.",
  "....kPPkkPPk....",
  "...kkkk  kkkk..."
];
const WRAITH = [
  "................",
  "......kkkk......",
  ".....kvVVvk.....",
  "....kvVVVVvk....",
  "....kvVkkVvk....",
  "....kvVxxVvk....",
  "....kvVVVVvk....",
  "...kvVVVVVVvk...",
  "...kvVVVVVVvk...",
  "..kvVVVVVVVVvk..",
  "..kvVVVVVVVVvk..",
  "..kvVVvVVvVVvk..",
  "...kvVkvvkVvk...",
  "....kvk..kvk....",
  ".....k....k.....",
  "................"
];

/* ---------------- items ---------------- */
const POTION = [
  "................",
  "................",
  "......kkkk......",
  "......kzzk......",
  "......kzzk......",
  ".....kkzzkk.....",
  ".....kZzzZk.....",
  "....kZzzzzZk....",
  "....kZRRRRZk....",
  "....kZRqqRZk....",
  "....kZRRRRZk....",
  "....kZRRRRZk....",
  ".....kZRRZk.....",
  "......kkkk......",
  "................",
  "................"
];
const FLASK = [
  "................",
  "................",
  "......kkkk......",
  "......kzzk......",
  "......kzzk......",
  ".....kkzzkk.....",
  ".....kZzzZk.....",
  "....kZzzzzZk....",
  "....kZOOOOZk....",
  "....kZOffOZk....",
  "....kZOfFOZk....",
  "....kZOOOOZk....",
  ".....kZOOZk.....",
  "......kkkk......",
  "................",
  "................"
];
const SCROLL = [
  "................",
  "................",
  "................",
  "...kkkkkkkkkk...",
  "..kZZZZZZZZZZk..",
  "..kZzzzzzzzzZk..",
  "..kZzkkzkkzzZk..",
  "..kZzzzzzzzzZk..",
  "..kZzkkkkzzzZk..",
  "..kZzzzzzzzzZk..",
  "..kZzkkzkkkzZk..",
  "..kZzzzzzzzzZk..",
  "..kZZZZZZZZZZk..",
  "...kkkkkkkkkk...",
  "................",
  "................"
];
const BLADE = [
  "................",
  "..........kk....",
  ".........kEik...",
  "........kEEik...",
  ".......kEEik....",
  "......kEEik.....",
  ".....kEEik......",
  "....kEEik.......",
  "...kEEik........",
  "..kEEik.........",
  ".kkEik..........",
  "kOOkk...........",
  "kOOOk...........",
  ".kOOk...........",
  "..kk............",
  "................"
];

const SPRITE_SOURCE = {
  floorA: FLOOR_A, floorB: FLOOR_B, floorC: FLOOR_C,
  wallFace: WALL_FACE, wallTop: WALL_TOP,
  door: SPR_DOOR, stairs: SPR_STAIRS, hero: HERO,
  Rat: RAT, Goblin: GOBLIN, Orc: ORC, Ogre: OGRE, Wraith: WRAITH,
  potion: POTION, flask: FLASK, scroll: SCROLL, blade: BLADE
};

/* Paint every sprite once into its own canvas. */
const SPRITES = {};
function buildSprites(){
  for (const [name, rows] of Object.entries(SPRITE_SOURCE)){
    const canvas = document.createElement("canvas");
    canvas.width = TILE; canvas.height = TILE;
    const ctx = canvas.getContext("2d");
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length && x < TILE; x++){
        const colour = PALETTE[row[x]];
        if (!colour) continue;
        ctx.fillStyle = colour;
        ctx.fillRect(x, y, 1, 1);
      }
    });
    SPRITES[name] = canvas;
  }
}
/* Which sprite stands in for a carried or dropped item. */
function itemSprite(item){
  if (item.kind === "weapon") return SPRITES.blade;
  if (item.kind === "thrown") return SPRITES.flask;
  if (item.kind === "scroll") return SPRITES.scroll;
  return SPRITES.potion;
}
