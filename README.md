# Cli-game-

A terminal roguelike dungeon crawler built with [Textual](https://textual.textualize.io/).

Procedurally generated dungeons, a different one every run, explored one turn at a
time by torchlight — with things in the dark that hunt you.

![The game in play](docs/screenshot.svg)

A run moves through three screens — the title screen picks a seed, the game screen
plays it out, and the game over screen reports how it went before handing back a
fresh seed.

| | |
|---|---|
| ![Title screen](docs/title.svg) | ![Game over](docs/game-over.svg) |

Aiming a thrown flask — the cursor sits on the target, the tiles around it are the
blast it would cover:

![Aiming a thrown item](docs/aiming.svg)

## Status

All ten roadmap steps are complete, and so are the five stretch goals. A run goes:
pick a seed, descend, explore under fog of war, fight things that each hunt you
differently, level up on what you kill, gear up from what you find, take the stairs
into something worse, and eventually die — permanently — to a screen that tells you
how far you got. You can suspend a run to disk and pick it up later, but you cannot
rewind one.

- [x] 1. Project scaffold
- [x] 2. Dungeon generation (BSP rooms + corridors, seeded)
- [x] 3. Rendering (`@` player, `#` wall, `.` floor, `+` door)
- [x] 4. Player movement with collision detection
- [x] 5. Fog of war (shadowcast FOV, remembered tiles drawn dim)
- [x] 6. Entities & combat (chase-on-sight AI, bump-to-attack, death)
- [x] 7. Inventory & items (potions, weapons, scrolls; walk-over pickup, `i` to open)
- [x] 8. Stairs & floor progression (`>` descends into a harder floor)
- [x] 9. Permadeath + game over screen (run stats, then a fresh seed)
- [x] 10. Status panel (health, gear, pack, and what is nearby)

### Stretch goals

- [x] Save/load game state to JSON (suspend a run; loading consumes the save)
- [x] Ranged items (thrown flasks and a targeted fireball scroll, with an aiming cursor)
- [x] Enemy variety — different stats *and* behaviours per floor depth
- [x] Message log panel (combat, pickups, deaths)
- [x] Colorized tiles and entities via Textual styling

### Beyond the brief

- [x] Character progression — experience, levels, and stat gains, so the player's
      power curve keeps pace with the dungeon's

## Playing it on a phone

`web/ember-depths.html` is a self-contained browser port — one file, no build step,
no dependencies. Open it in any browser, or serve the folder and visit it from a
phone on the same network.

It carries the rules over faithfully: the same BSP generation, the same shadowcast
field of view, the same species, items, combat arithmetic and balance figures. A
test compares the two builds' difficulty tables floor by floor and they match
exactly. Two things are deliberately different:

- **Seeds do not correspond.** The terminal build draws from Python's random number
  generator, which the browser cannot reproduce, so the same seed number builds a
  different dungeon in each.
- **It is built for a touchscreen.** Tap a tile to step toward it, or use the thumb
  pad; a run is suspended to `localStorage` rather than to a file. Torchlight also
  falls off across three steps of brightness rather than the terminal's two, which
  is the one thing the browser can do that a terminal cannot.

The Python build in `roguelike/` remains the reference implementation.

## Quick start

```bash
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

python -m roguelike
```

Installing the package instead (`pip install -e .`) also gives you a `roguelike`
command on your PATH.

## Controls

| Key | Action |
| --- | --- |
| `↑` `↓` `←` `→` | Move |
| `W` `A` `S` `D` | Move |
| `K` `J` `H` `L` | Move (vi keys) |
| `Space` `.` | Wait a turn |
| `I` | Open the pack (`a`-`p` to drink, wield, or aim; `esc` to close) |
| `>` | Take the stairs down |
| `Shift`+`S` | Suspend the run to disk and exit to the title screen |
| `N` | Abandon this run, back to the title screen |
| `Q` | Quit |

On the title screen, `Enter` begins, `R` rolls a different seed, and `C` continues
a suspended run.

Choosing a thrown item from the pack starts **aiming**: the arrow keys move the
cursor, `Tab` jumps to the next monster in reach, `Enter` throws, and `Esc` puts it
away. The tiles the blast would cover are highlighted, and the cursor turns red
where you have no shot.

Walking into a monster attacks it. Every action you take — moving, attacking, or
waiting — gives the dungeon a turn back.

## Tiles

| Glyph | Meaning |
| --- | --- |
| `@` | You |
| `#` | Wall |
| `.` | Floor |
| `+` | Door (blocks sight, so rooms stay dark until you step in) |
| `>` | Stairs down (step 8) |
| `r` `g` `o` `O` `W` | Rat, Goblin, Orc, Ogre, Wraith |
| `!` | Potion, or a flask to throw |
| `/` | Weapon |
| `?` | Scroll |

Items are picked up by walking over them.

Tiles in view are drawn bright; tiles you have seen before but cannot currently
see are drawn dim. Unexplored tiles are blank, and monsters are only drawn when
you can actually see them.

## File structure

```
.
├── pyproject.toml           # package metadata, deps, pytest config
├── requirements.txt         # runtime deps (textual)
├── requirements-dev.txt     # runtime deps + pytest
├── roguelike/
│   ├── __init__.py
│   ├── __main__.py          # `python -m roguelike`
│   ├── map_gen.py           # BSP dungeon generation, TileMap, tile glyphs
│   ├── fov.py               # recursive shadowcasting, Bresenham line of sight
│   ├── entities.py          # Entity / Actor / Player / Monster + species table
│   ├── combat.py            # melee damage resolution
│   ├── inventory.py         # items, their effects, and the pack
│   ├── persistence.py       # saving a run to JSON and reading it back
│   ├── game.py              # GameState: the whole run, turn loop, AI, camera
│   └── main.py              # Textual app: screens, MapView, log, status panel
├── docs/
│   ├── screenshot.svg       # all captured from real sessions
│   ├── title.svg
│   ├── inventory.svg
│   ├── aiming.svg
│   └── game-over.svg
└── tests/
    ├── helpers.py           # build a GameState from an ASCII drawing
    ├── test_map_gen.py      # determinism, structure, connectivity
    ├── test_fov.py          # shadowcasting, shadows, line of sight
    ├── test_game.py         # movement, collision, camera
    ├── test_ai_combat.py    # fog of war, monster AI, combat, death
    ├── test_items.py        # pickup, potions, weapons, scrolls, spawning
    ├── test_floors.py       # stairs, descending, the difficulty curve
    ├── test_run_stats.py    # permadeath, what killed you, the run summary
    ├── test_behaviour.py    # how each species spends its turn
    ├── test_ranged.py       # aiming, blast radius, and refused throws
    ├── test_persistence.py  # JSON round trips and refusing bad saves
    ├── test_progression.py  # experience, levels, and the difficulty curve
    ├── test_combat_inventory.py
    └── test_app.py          # drives the real app headlessly
```

## Levelling

Killing things earns experience, worth more for tougher monsters and for the
harder specimens found deeper down. Experience is derived from the stats a
monster actually spawned with rather than a number on the species, so the tables
only need one set of figures.

Each level grants:

| | |
|---|---|
| Maximum health | `+5`, granted as healing too, so a hard-won kill can carry you into the next fight |
| Attack | `+1` every second level |
| Defense | `+1` every third level |

Each level costs more than the one before it (`60 × current level`), so
progression slows without ever stopping.

## Design notes

- **One state object.** Everything mutable about a run lives on `GameState`.
  The UI holds a reference to it, asks it to perform actions, and redraws — it
  keeps no game data of its own.
- **Seeded randomness only.** `GameState.rng` is a `random.Random` created from
  `GameState.seed`; dungeon generation and every later system draw from it. The
  seed is shown in the sidebar, so any run can be replayed exactly.
- **Connected dungeons.** BSP guarantees non-overlapping rooms, and every
  internal node joins its two subtrees with an L-shaped corridor, so the whole
  floor is always one connected component. A test flood-fills 50 seeds to prove it.
- **Camera.** The map is larger than most terminals, so `camera_origin()` frames
  a viewport on the player, clamped to the map edges.
- **Visibility.** `fov.py` computes what the player can see with recursive
  shadowcasting over eight octants, and takes a `blocks_sight(x, y)` predicate
  rather than a map, so it stays independent of how tiles are stored.
  `GameState.visible` is recomputed each turn; `GameState.explored` accumulates
  and is never cleared while you are on a floor.
- **Monster sight.** Monsters use a cheap Bresenham line-of-sight check instead
  of a full FOV cast — one line per monster per turn rather than eight octants.
- **Turn loop.** A player action that succeeds spends a turn, then every living
  monster acts, then visibility is recomputed and death is checked. A move into
  a wall fails and costs nothing, so the dungeon does not get a free hit.
- **Items.** An item's effect is a function of the `GameState`, so a scroll can
  heal, burn, teleport, or redraw the map without the item system needing its
  own hooks into everything. `inventory.py` imports `GameState` only under
  `TYPE_CHECKING`, which keeps the dependency pointing one way.
- **Floors.** `generate_floor()` builds a floor and drops the player at its
  entrance; the player object itself is untouched, so it serves both the start
  of a run and arrival on a deeper floor. Stairs go in the room furthest from
  the entrance, so a floor cannot be crossed in a couple of steps.
- **Screens.** The title, game, inventory, and game over screens are separate
  Textual screens, so only one of them can be driven at a time — you cannot walk
  the dungeon with the pack open, or from behind the game over report. The two
  modal screens handle their keys in `on_key` rather than as bindings, because
  stopping an event (which is what keeps it off the dungeon below) also stops it
  before binding processing.
- **Permadeath.** `GameState` refuses every action once `game_over` is set, and a
  new run builds a whole new `GameState` — nothing is carried across but the
  summary shown on the title screen.
- **Suspending, not save-scumming.** A save is a way to stop playing, not a way
  to retry: loading deletes the file on the way in, and dying deletes it too. So
  a run can be put down and picked up, but never rewound. The generator's own
  internal state is part of the save, so a resumed run produces exactly the
  floors an uninterrupted one would have — there is a test that plays the same
  moves both ways and compares the results.
- **Behaviour, not just stats.** Bigger numbers deeper down only go so far, so
  each species also spends its turn differently: rats break and run when hurt,
  ogres act every other turn but hit like a truck, and wraiths remember where
  you were and keep coming after they lose sight of you.
- **Progression is balanced against the dungeon, not just added to it.** Levelling
  raises the player's ceiling, so monsters gain attack with absolute depth to
  match. Without that second half, descending made the game *easier* — see below.
- **Aiming.** Throwing is a mode on the game screen rather than another screen,
  because the map underneath has to stay visible and keep updating. While it is
  active the movement keys drive a cursor instead of the player, and every other
  action is held back.

## Development

```bash
pip install -r requirements-dev.txt
pytest
```

538 tests. The suite covers the generator (determinism, no overlapping rooms,
flood-filled connectivity across 50 seeds), the FOV algorithm (shadows, gaps,
radius limits), the turn loop, per-species AI, items, ranged throws, descent,
levelling, run stats and JSON round trips on hand-drawn ASCII maps, and a set of
end-to-end tests that drive the real Textual app headlessly — through the title
screen, a run, aiming and throwing, suspending and resuming, death, and back
again. Two of them guard the difficulty curve itself.

Because everything random comes from the seeded `GameState.rng`, a whole run
replays exactly: the same seed plus the same key presses gives the same result,
down to the message log.

## Balance

The difficulty curve was tuned against measurement rather than taste. A scripted
bot plays whole runs — exploring, fighting, drinking potions, wielding the best
weapon it finds — and reports how deep it gets.

The first version of steps 7–8 was unplayable past floor 2: a single Orc cost
50% of the player's maximum HP, an Ogre 107%, and a Wraith 120%, so the deeper
species could never actually be met. Three changes fixed the curve:

- Monster attack values were cut so a standard monster costs 3–13% of the
  player's HP per fight and an elite 27–40%, with nothing able to one-shot a
  healthy player (there is a test asserting exactly that).
- Each weapon tier now unlocks one floor *before* the monster it answers, and
  every floor is guaranteed to contain at least one weapon — the player's attack
  only grows by finding one, so it should not be left entirely to chance.
- Taking the stairs restores some health. Healing on descent rather than every
  turn means it cannot be farmed by standing still.

The same bot now reaches floors 3–4 instead of 1–2. It plays badly on purpose —
it walks straight at everything it sees and never retreats — so a human should
get further.

Adding thrown items and per-species behaviours later did not move that number:
flasks of fire give the player real burst damage, but slow ogres and stalking
wraiths push back, and the bot still landed on floors 2–4.

### Levelling, and the trap in it

The player's maximum health used to be fixed at 30 for a whole run, which put the
deep floors permanently out of reach. Character levels fixed that — but the first
version overcorrected, and not in a way the bot revealed: it went *deeper*
(floors 2–7), which looked like a success.

Working out the cost of the nastiest fight on each floor told the real story:

```
floor      1     2     3     4     5     6     7     8
before    13%   22%   14%   17%   15%   13%   12%   11%
```

Descending was making the game *easier*. The player's `+5` health a level was
outrunning the monsters' `+1` health per floor since their species arrived, so
by floor 8 the worst thing down there cost half what a floor-2 orc did. The bot
only died to attrition — enough monsters, eventually — rather than to anything
being dangerous.

The fix came from a small parameter search over the player's per-level gains and
the monsters' per-floor gains, scoring each combination on how many floors landed
in a 20–32% band and whether danger held steady with depth. It settled on `+5`
health a level for the player, and one more point of attack for everything living
two floors further down:

```
floor      1     2     3     4     5     6     7     8
after     13%   23%   20%   20%   20%   22%   23%   22%
```

The bot now reaches floors 2–6 rather than 2–4, with the deepest species finally
in play, and two tests keep it that way: one asserts the worst fight on every
floor stays inside that band, and one asserts danger never fades with depth.

Still unsolved, and inherent to the bot rather than the balance: it walks straight
at everything it sees and never retreats, so it is a floor on what the game
allows, not a ceiling.
