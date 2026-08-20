"""Shared test scaffolding: build a GameState from an ASCII drawing.

Laying maps out as text keeps the AI, combat, and item tests readable — the
scenario under test is visible at a glance.
"""

from __future__ import annotations

from random import Random

from roguelike.entities import MONSTER_TEMPLATES, Monster, make_player
from roguelike.game import GameState
from roguelike.map_gen import FLOOR, TileMap

MONSTER_CHARS = {template.char: template for template in MONSTER_TEMPLATES}


def build(rows: list[str], seed: int = 0, floor: int = 1) -> GameState:
    """A GameState laid out exactly as drawn.

    ``@`` is the player, monster glyphs (``r``, ``g``, ``o``, ``O``, ``W``)
    place that species, and everything else is taken as a map tile.
    """
    grid = [list(row) for row in rows]
    tile_map = TileMap(width=len(grid[0]), height=len(grid), grid=grid)

    player = None
    monsters: list[Monster] = []
    for y, row in enumerate(grid):
        for x, char in enumerate(row):
            if char == "@":
                player = make_player(x, y)
                grid[y][x] = FLOOR
            elif char in MONSTER_CHARS:
                monsters.append(MONSTER_CHARS[char].spawn(x, y, floor=floor))
                grid[y][x] = FLOOR

    assert player is not None, "map has no @ for the player"
    game = GameState(
        seed=seed,
        rng=Random(seed),
        tile_map=tile_map,
        player=player,
        floor=floor,
        width=tile_map.width,
        height=tile_map.height,
        entities=list(monsters),
    )
    game.update_fov()
    return game


class ScriptedRng(Random):
    """A Random whose ``choice`` always takes a fixed position in the sequence.

    Lets a test pin down which random scroll effect fires without hunting for
    a seed that happens to produce it.
    """

    def __init__(self, index: int = 0) -> None:
        super().__init__(0)
        self.index = index

    def choice(self, seq):  # type: ignore[override]
        items = list(seq)
        return items[self.index % len(items)]
