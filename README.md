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
npm run artifact # build a single-file embeddable page (artifact/page.html shell)
npm run smoke:mobile  # emulate a phone and drive the touch controls
npm run android:apk   # build a signed, sideloadable APK into dist/app/
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
| Mute / Volume | `M` / `-` and `+` |

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

## On a phone

The same build runs on a phone; there is no separate mobile version.

**Touch controls.** A movement pad on the left, a thumb cluster on the right
with jump and attack in the two most reachable spots, parry directly above
attack, and roll above jump. Two details do the heavy lifting:

- Pointers are tracked individually and the pressed set is the union across all
  of them, so holding left while swinging and parrying works.
- Hit-testing runs on every pointer *move*, not just on down, so rolling a thumb
  from attack onto parry registers as a real press. Per-element listeners cannot
  do this, and it is the difference between the combat being playable and not.

The game is 16:9 and letterboxes on a taller phone panel, which is deliberate:
the bars give thumbs somewhere to rest that is not on top of the action.

Rotating to portrait pauses and shows a prompt. Backgrounding pauses. The screen
is kept awake, and the wake lock is re-acquired after every hide because the
browser drops it. Android gets haptics on hits, parries and death; iOS ignores
`navigator.vibrate`, so it simply does not there.

### Installing it

**iPhone, or any browser** — open the site, then Share → *Add to Home Screen*.
It runs fullscreen from its own icon and works offline via the service worker.
This is the only route onto an iPhone: an APK cannot be installed there, and a
native iOS build needs Xcode on a Mac plus a paid Apple developer account.

**Android** — either install it as a web app the same way, or sideload the APK:

```bash
npm run android:key   # once: generate a local signing key
npm run android:apk   # -> dist/app/penitence-1.0.apk
```

Copy the APK to the phone and open it, allowing installs from unknown sources
when prompted. It is signed with a self-signed key, so Play Protect will warn
that the developer is unrecognised — expected for a sideloaded build.

Building the APK needs `ANDROID_HOME` pointing at an SDK with platform 36 and
build-tools 36, plus a JDK. The `android/` project is tracked, but its build
output, `local.properties` and the keystore are not.

## Sound

There are no audio files either. Every sound is synthesised at runtime through
one graph:

```
voices ──┬─ dry ─────────────────┬─ sfx bus ───┐
         └─ send ─> convolver ───┘             ├─> master ─> limiter ─> out
                     music ─> fade stage ──────┘
```

- **The reverb** is a `ConvolverNode` running a generated impulse response —
  exponentially decaying noise with a short pre-delay. It is the single thing
  that makes the rooms sound like stone.
- **Bells** (the parry chime, the altar, the boss tolls) are built from real
  inharmonic partials — hum, prime, tierce, quint, nominal. The minor-third
  tierce is why they sound mournful rather than like a beep.
- **The score's voice** is Karplus-Strong: a noise burst fed through a short
  averaging delay line, rendered into a buffer and cached per pitch. It reads as
  a plucked nylon string.
- **A limiter** on the master means levels can sit where they belong instead of
  being kept timid in case several loud sounds land on the same frame.

The music is generated, not looped. It sits in **E Phrygian** and leans on the
**Andalusian cadence** (Am–G–F–E), the progression behind Spanish liturgical and
flamenco music — the same well the setting draws from. Notes are scheduled
against the audio clock a fraction of a second ahead, so tempo never wobbles
with the frame rate. Each room mood picks a score: sparser and lower in the
cistern, denser and faster on the approach, and a two-chord tritone theme for
the Abbot.

Crossfades run through a dedicated gain stage rather than scaling each note as
it is queued. That distinction matters: a bar is scheduled seconds before it
sounds, so a fade applied at schedule time lands on the wrong notes and leaves
a whole bar of dead air on every room change.

`M` mutes, `-` and `+` set the volume, and both persist.

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
src/core/      loop, input, math, rng, pitch   — no game knowledge
src/engine/    canvas, camera, tilemap, physics, fx, font, backdrop, draw, audio
src/game/      player, combat, enemies, rooms, world, progression, music, ui
src/content/   rooms, palette, sfx             — data, not code
artifact/      page.html — the designed shell the game is embedded in
tools/         inline.mjs and artifact.mjs (single-file builds),
               smoke.mjs and verify-artifact.mjs (headless checks)
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

It also measures the master bus through an `AnalyserNode`: that the game makes
an audible sound, that every entry in the sound library plays without throwing,
and that muting actually silences the output. "No errors were thrown" is not
evidence that a synthesised soundtrack made a sound.
