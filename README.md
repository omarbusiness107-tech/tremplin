# Penitence

A 2D side-scrolling action-platformer in the mould of *Blasphemous*: parry-led
combat, an interconnected map gated by traversal abilities, prayer altars for
checkpoints, and a penance system that makes dying cost something.

Runs in the browser. TypeScript on a raw 2D canvas — no game engine, no art
assets. Every sprite, tile and glyph is drawn from primitives at a 480×270
internal resolution and scaled up with nearest-neighbour.

```bash
npm install
npm run dev      # play at the printed localhost URL
npm run build    # typecheck + production build into dist/
npm run bundle   # build, then inline everything into dist/penitence.html
npm run smoke    # bundle, then drive the game in headless Chromium
```

## Controls

| Action | Keys |
| --- | --- |
| Move | `A`/`D` or arrows |
| Jump | `Space` (again in mid-air once you own the second breath) |
| Attack | `J` — three-hit combo; hold `Down` + `J` in the air to plunge |
| Heavy | `K` — slow, breaks shields |
| Parry | `L` — 8-frame window |
| Roll | `Shift` — invulnerable through the middle |
| Flask | `Q` — heal, grounded only |
| Pray | `W`/`Up` at an altar |
| Map / Pause | `Tab` / `Esc` |

A standard gamepad works too, if one is connected.

## The combat loop

Parry is the centre of the design, so everything else is built to serve it.

- **Telegraphs.** Every enemy attack has a long, visible wind-up: a red outline
  and glow, plus a distinct pose (the shambler raises its blade overhead, the
  thurifer swings its censer back). Attacks are readable *before* they land.
- **Parry** has 8 active frames out of a 26-frame commitment, so a miss is
  punished. A success costs no health, staggers the attacker, grants fervour,
  and opens a **riposte** window: the next attack deals triple damage.
- **Poise.** Enemies have a separate stagger pool. Emptying it — or parrying —
  breaks them open. This is the intended damage route against tougher enemies.
- **Hitstop** freezes gameplay (but not particles or the camera) for a handful
  of frames on every connection. It is the single biggest contributor to how a
  hit feels, which is why it lives in `engine/fx.ts` rather than being sprinkled
  through combat code.
- **The Warden** turns aside frontal light attacks entirely. Its three answers —
  parry the swing, break the guard with a heavy, or roll behind it — are the
  game's statement of intent.

Frame data lives in one place, `src/game/playerStats.ts`, so the feel can be
tuned without touching logic.

## The map

```
  cell ── cloister ── gallery ── cistern ── approach ── sanctum
              │           │                    (gate)     (boss)
              └───────  reliquary
                (shortcut)   ▲ needs the second breath
```

The intended route: pick up the **second breath** (double jump) in the cistern,
backtrack to the gallery, climb its ascent to the **reliquary**, take the **seal
breaker**, and drop through the shortcut back into the cloister. The seal
breaker opens the warded gate on the approach to the boss.

The gallery ascent is the one hard gate, and its geometry is deliberate: each
step is a 32px rise (a single jump clears 44px), and the final gap to the high
ledge is 64px — impossible on one jump, comfortable on two. `npm run smoke`
asserts both directions of that gate, because a wrong number there quietly makes
the game uncompletable.

## Penance

Dying drops a **guilt** mark where you fell, taking your tears with it and
capping your usable fervour at 55% until you reclaim it. Praying at an altar
restores health and flasks, sets your respawn point, and brings every enemy in
the room back.

## Adding content

**A room** is an ASCII grid in `src/content/rooms.ts`. Terrain is `#` stone, `=`
one-way platform, `^` spikes, `|` a warded gate. Markers place actors: `@` spawn,
`A` altar, `s`/`t`/`w` the three enemies, `B` the boss, `D`/`K`/`F`/`H`/`$`
pickups. A marker names the tile an actor *stands in* — its feet go on that
tile's floor. Rows must all be the same length; the loader throws if they are
not, which is how a ragged room is caught at boot rather than as a mystery
collision bug.

**An enemy** extends `Enemy` (`src/game/enemy.ts`) and implements `think` and
`draw`. The base class handles health, poise, stagger, knockback, death and the
shared telegraph tint. Override `blocks` to add a guard.

## Layout

```
src/core/      loop, input, math, rng      — no game knowledge
src/engine/    canvas, camera, tilemap, physics, fx, font, backdrop, draw
src/game/      player, combat, enemies, rooms, world, progression, ui
src/content/   rooms, palette              — data, not code
tools/         inline.mjs (single-file build), smoke.mjs (headless play-test)
```

Gameplay runs on a fixed 1/60s timestep so that every frame-counted timing —
i-frames, the parry window, hitstop — is identical on any refresh rate.
Rendering happens once per animation frame.

## Testing

`npm run smoke` boots the bundled game in headless Chromium and drives it with
real key events: it starts a run, walks and jumps, fights the first enemy to
death, crosses a door, opens the map, dies and checks that guilt is left behind,
rises at the altar, tests the double-jump gate in both directions, and reaches
the boss arena — failing on any console error along the way. Screenshots land in
`dist/shots/`.
