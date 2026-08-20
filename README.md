# Cli-game-

A terminal roguelike dungeon crawler built with [Textual](https://textual.textualize.io/).

Procedurally generated dungeons, a different one every run, explored one turn at a
time by torchlight — with things in the dark that hunt you.

![The game in play](docs/screenshot.svg)

## Status

Steps 1–8 of the roadmap are complete and playable end to end: generate a dungeon,
explore it under fog of war, fight monsters, gear up from what you find, and take
the stairs down into something worse.

- [x] 1. Project scaffold
- [x] 2. Dungeon generation (BSP rooms + corridors, seeded)
- [x] 3. Rendering (`@` player, `#` wall, `.` floor, `+` door)
- [x] 4. Player movement with collision detection
- [x] 5. Fog of war (shadowcast FOV, remembered tiles drawn dim)
- [x] 6. Entities & combat (chase-on-sight AI, bump-to-attack, death)
- [x] 7. Inventory & items (potions, weapons, scrolls; walk-over pickup, `i` to open)
- [x] 8. Stairs & floor progression (`>` descends into a harder floor)
- [ ] 9. Permadeath + game over screen (death already ends the run; the stats
      screen comes with this step)
- [ ] 10. Status panel (a working one already ships; it grows with the features above)

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
| `I` | Open the pack (`a`-`p` to drink or wield, `esc` to close) |
| `>` | Take the stairs down |
| `N` | Abandon this run, roll a new dungeon |
| `Q` | Quit |

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
| `!` | Potion |
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
│   ├── game.py              # GameState: the whole run, turn loop, AI, camera
│   └── main.py              # Textual app: MapView, MessageLog, StatusPanel
├── docs/
│   ├── screenshot.svg       # captured from a real session
│   └── inventory.svg
└── tests/
    ├── helpers.py           # build a GameState from an ASCII drawing
    ├── test_map_gen.py      # determinism, structure, connectivity
    ├── test_fov.py          # shadowcasting, shadows, line of sight
    ├── test_game.py         # movement, collision, camera
    ├── test_ai_combat.py    # fog of war, monster AI, combat, death
    ├── test_items.py        # pickup, potions, weapons, scrolls, spawning
    ├── test_floors.py       # stairs, descending, the difficulty curve
    ├── test_combat_inventory.py
    └── test_app.py          # drives the real app headlessly
```

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

## Development

```bash
pip install -r requirements-dev.txt
pytest
```

405 tests. The suite covers the generator (determinism, no overlapping rooms,
flood-filled connectivity across 50 seeds), the FOV algorithm (shadows, gaps,
radius limits), the turn loop, AI, items and descent on hand-drawn ASCII maps,
and a set of end-to-end tests that drive the real Textual app headlessly.

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

One thing it does *not* solve: the player's maximum HP never grows, so the very
deep floors stay out of reach. Closing that gap needs a character progression
mechanic (XP levels, or HP gained per floor), which is a design decision rather
than a tuning one, so it is left alone for now.
