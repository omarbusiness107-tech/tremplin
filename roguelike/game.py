"""The single source of truth for a run: :class:`GameState`.

All mutable game data lives on one ``GameState`` instance — there are no module
level globals — and every random decision is drawn from ``GameState.rng``, a
seeded ``random.Random``. Give the same seed twice and you get the same dungeon.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from random import Random

from .entities import Actor, Player, make_player
from .map_gen import TileMap, generate_dungeon

MAP_WIDTH = 80
MAP_HEIGHT = 45

# The four cardinal steps, keyed by the action names used in the UI.
DIRECTIONS: dict[str, tuple[int, int]] = {
    "up": (0, -1),
    "down": (0, 1),
    "left": (-1, 0),
    "right": (1, 0),
}


def random_seed() -> int:
    """A fresh seed for a new run."""
    return random.randrange(2**31)


@dataclass
class GameState:
    """Everything that makes up one run of the game."""

    seed: int
    rng: Random
    tile_map: TileMap
    player: Player
    floor: int = 1
    turns: int = 0
    entities: list[Actor] = field(default_factory=list)

    @classmethod
    def new_game(
        cls,
        seed: int | None = None,
        width: int = MAP_WIDTH,
        height: int = MAP_HEIGHT,
    ) -> GameState:
        """Start a run. ``seed=None`` picks a fresh random seed."""
        if seed is None:
            seed = random_seed()
        rng = Random(seed)
        tile_map = generate_dungeon(width, height, rng)
        start_x, start_y = tile_map.rooms[0].center
        player = make_player(start_x, start_y)
        return cls(seed=seed, rng=rng, tile_map=tile_map, player=player)

    # -- queries ---------------------------------------------------------

    def blocking_entity_at(self, x: int, y: int) -> Actor | None:
        """The living, blocking entity standing on (x, y), if any."""
        for entity in self.entities:
            if entity.blocks and entity.is_alive and entity.position == (x, y):
                return entity
        return None

    def is_walkable(self, x: int, y: int) -> bool:
        """True when the player could stand on (x, y) this turn."""
        if not self.tile_map.is_walkable(x, y):
            return False
        return self.blocking_entity_at(x, y) is None

    # -- actions ---------------------------------------------------------

    def move_player(self, dx: int, dy: int) -> bool:
        """Try to step the player by (dx, dy).

        Returns True when the player moved (and a turn was spent), False when
        a wall or another entity blocked the step.
        """
        target_x = self.player.x + dx
        target_y = self.player.y + dy
        if not self.is_walkable(target_x, target_y):
            return False

        self.player.move_to(target_x, target_y)
        self.turns += 1
        return True

    def move_player_in_direction(self, direction: str) -> bool:
        """Step the player one tile in a named direction ('up', 'left', ...)."""
        dx, dy = DIRECTIONS[direction]
        return self.move_player(dx, dy)


def camera_origin(
    focus_x: int,
    focus_y: int,
    view_width: int,
    view_height: int,
    map_width: int,
    map_height: int,
) -> tuple[int, int]:
    """Top-left map tile of a viewport centred on (focus_x, focus_y).

    The viewport is clamped to the map, so the camera stops at the edges
    instead of scrolling past them into empty space.
    """
    origin_x = focus_x - view_width // 2
    origin_y = focus_y - view_height // 2
    max_x = max(0, map_width - view_width)
    max_y = max(0, map_height - view_height)
    return max(0, min(origin_x, max_x)), max(0, min(origin_y, max_y))
