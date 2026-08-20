# Cli-game-

A terminal roguelike dungeon crawler built with [Textual](https://textual.textualize.io/).

Procedurally generated dungeons, a different one every run, explored one turn at a time.

## Status

Steps 1–4 of the roadmap are complete and playable end to end: you can start the
game, get a freshly generated dungeon, and walk around it with wall collision.

- [x] 1. Project scaffold
- [x] 2. Dungeon generation (BSP rooms + corridors, seeded)
- [x] 3. Rendering (`@` player, `#` wall, `.` floor, `+` door)
- [x] 4. Player movement with collision detection
- [ ] 5. Fog of war
- [ ] 6. Entities & combat
- [ ] 7. Inventory & items
- [ ] 8. Stairs & floor progression
- [ ] 9. Permadeath + game over screen
- [ ] 10. Status panel (a minimal one already ships; it grows with the features above)

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
| `N` | Abandon this dungeon, roll a new one |
| `Q` | Quit |

## Tiles

| Glyph | Meaning |
| --- | --- |
| `@` | You |
| `#` | Wall |
| `.` | Floor |
| `+` | Door |
| `>` | Stairs down (step 8) |

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
│   ├── entities.py          # Entity / Actor / Player
│   ├── combat.py            # melee damage resolution (used from step 6)
│   ├── inventory.py         # Item + Inventory container (used from step 7)
│   ├── game.py              # GameState: the whole run, movement, camera
│   └── main.py              # Textual app: MapView, StatusPanel, key bindings
└── tests/
    ├── test_map_gen.py      # determinism, structure, connectivity
    ├── test_game.py         # movement, collision, camera
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

## Development

```bash
pip install -r requirements-dev.txt
pytest
```
