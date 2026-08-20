"""The single source of truth for a run: :class:`GameState`.

All mutable game data lives on one ``GameState`` instance — there are no module
level globals — and every random decision is drawn from ``GameState.rng``, a
seeded ``random.Random``. Give the same seed twice and you get the same dungeon,
the same monsters, and the same outcome from the same key presses.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from random import Random

from .combat import resolve_attack
from .entities import Actor, Monster, Player, make_player, templates_for_floor
from .fov import compute_fov, line_of_sight
from .map_gen import TileMap, generate_dungeon

MAP_WIDTH = 80
MAP_HEIGHT = 45

#: How far the player can see, in tiles.
FOV_RADIUS = 9

#: Monster count scales with the size of the floor, so a big dungeon does not
#: end up feeling empty, plus a flat bonus for each floor descended.
MIN_MONSTERS = 4
ROOMS_PER_MONSTER = 2
MONSTERS_PER_FLOOR = 2

#: How many log lines to keep.
MAX_MESSAGES = 100

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


@dataclass(frozen=True)
class Message:
    """One line in the message log."""

    text: str
    color: str = "white"


@dataclass
class GameState:
    """Everything that makes up one run of the game."""

    seed: int
    rng: Random
    tile_map: TileMap
    player: Player
    floor: int = 1
    turns: int = 0
    kills: int = 0
    game_over: bool = False
    entities: list[Actor] = field(default_factory=list)
    messages: list[Message] = field(default_factory=list)
    #: Tiles the player can see right now.
    visible: set[tuple[int, int]] = field(default_factory=set)
    #: Tiles the player has seen at any point on this floor.
    explored: set[tuple[int, int]] = field(default_factory=set)

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
        game = cls(seed=seed, rng=rng, tile_map=tile_map, player=player)
        game.entities = game._spawn_monsters()
        game.update_fov()
        game.log("You descend into the dungeon.", "rgb(150,200,255)")
        return game

    # -- logging ---------------------------------------------------------

    def log(self, text: str, color: str = "white") -> None:
        self.messages.append(Message(text, color))
        del self.messages[:-MAX_MESSAGES]

    def recent_messages(self, count: int) -> list[Message]:
        """The last ``count`` log lines, oldest first."""
        return self.messages[-count:] if count > 0 else []

    # -- spawning --------------------------------------------------------

    def _spawn_monsters(self) -> list[Actor]:
        """Populate the floor, keeping the player's starting room empty."""
        templates = templates_for_floor(self.floor)
        weights = [template.weight for template in templates]
        rooms = self.tile_map.rooms[1:]
        if not rooms or not templates:
            return []

        count = max(MIN_MONSTERS, len(rooms) // ROOMS_PER_MONSTER)
        count += MONSTERS_PER_FLOOR * (self.floor - 1)
        taken = {self.player.position}
        monsters: list[Actor] = []
        for _ in range(count):
            spot = self._free_spot_in(self.rng.choice(rooms), taken)
            if spot is None:
                continue
            taken.add(spot)
            template = self.rng.choices(templates, weights=weights, k=1)[0]
            monsters.append(template.spawn(*spot))
        return monsters

    def _free_spot_in(
        self,
        room,
        taken: set[tuple[int, int]],
        attempts: int = 20,
    ) -> tuple[int, int] | None:
        """A random unoccupied tile inside ``room``, or None if it is crowded."""
        for _ in range(attempts):
            x = self.rng.randrange(room.x, room.x2)
            y = self.rng.randrange(room.y, room.y2)
            if (x, y) not in taken and self.tile_map.is_walkable(x, y):
                return x, y
        return None

    # -- visibility ------------------------------------------------------

    def update_fov(self) -> None:
        """Recompute what the player can see, and remember it."""
        self.visible = compute_fov(
            self.tile_map.blocks_sight, self.player.position, FOV_RADIUS
        )
        self.explored |= self.visible

    def is_visible(self, x: int, y: int) -> bool:
        return (x, y) in self.visible

    def visible_monsters(self) -> list[Actor]:
        """Living monsters the player can currently see."""
        return [
            entity
            for entity in self.entities
            if entity.is_alive and entity.position in self.visible
        ]

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

    def _is_open_for_monster(self, x: int, y: int) -> bool:
        """True when a monster could step onto (x, y): no wall, no one there."""
        if not self.tile_map.is_walkable(x, y):
            return False
        if self.player.is_alive and self.player.position == (x, y):
            return False
        return self.blocking_entity_at(x, y) is None

    @staticmethod
    def _is_adjacent(a: Actor, b: Actor) -> bool:
        """Orthogonally adjacent — melee range, matching four-way movement."""
        return abs(a.x - b.x) + abs(a.y - b.y) == 1

    # -- player actions --------------------------------------------------

    def move_player(self, dx: int, dy: int) -> bool:
        """Step the player by (dx, dy), attacking whatever is in the way.

        Returns True when the turn was spent (a move or an attack), False when
        a wall blocked the step and nothing happened.
        """
        if self.game_over:
            return False

        target_x = self.player.x + dx
        target_y = self.player.y + dy

        target = self.blocking_entity_at(target_x, target_y)
        if target is not None:
            self._player_attacks(target)
        elif self.tile_map.is_walkable(target_x, target_y):
            self.player.move_to(target_x, target_y)
        else:
            return False

        self.turns += 1
        self._monsters_take_turn()
        self.update_fov()
        self._check_player_death()
        return True

    def move_player_in_direction(self, direction: str) -> bool:
        """Step the player one tile in a named direction ('up', 'left', ...)."""
        dx, dy = DIRECTIONS[direction]
        return self.move_player(dx, dy)

    def wait(self) -> bool:
        """Stand still and let the dungeon take its turn."""
        if self.game_over:
            return False
        self.turns += 1
        self._monsters_take_turn()
        self.update_fov()
        self._check_player_death()
        return True

    def _player_attacks(self, target: Actor) -> None:
        result = resolve_attack(self.player, target)
        self.log(
            f"You hit the {target.name} for {result.damage}."
            if result.damage
            else f"You hit the {target.name}, but it shrugs it off.",
            "rgb(255,220,120)",
        )
        if result.killed:
            self.kills += 1
            self.entities.remove(target)
            self.log(f"The {target.name} dies!", "rgb(120,220,160)")

    # -- monster turn ----------------------------------------------------

    def _monsters_take_turn(self) -> None:
        """Every living monster acts once, in spawn order."""
        # Iterate over a copy: a monster can be removed mid-turn.
        for monster in list(self.entities):
            if monster.is_alive and self.player.is_alive:
                self._take_monster_turn(monster)

    def _take_monster_turn(self, monster: Actor) -> None:
        """Attack the player if adjacent, else close in while it can see them."""
        if self._is_adjacent(monster, self.player):
            self._monster_attacks(monster)
            return
        if not self._can_see_player(monster):
            return
        self._step_toward(monster, self.player.position)

    def _can_see_player(self, monster: Actor) -> bool:
        radius = getattr(monster, "sight_radius", 8)
        return line_of_sight(
            self.tile_map.blocks_sight,
            monster.position,
            self.player.position,
            radius,
        )

    def _step_toward(self, monster: Actor, target: tuple[int, int]) -> None:
        """Greedy one-tile step, longer axis first, falling back to the other."""
        dx = target[0] - monster.x
        dy = target[1] - monster.y
        steps = [
            (1 if dx > 0 else -1, 0) if dx else None,
            (0, 1 if dy > 0 else -1) if dy else None,
        ]
        if abs(dy) > abs(dx):
            steps.reverse()

        for step in steps:
            if step is None:
                continue
            new_x, new_y = monster.x + step[0], monster.y + step[1]
            if self._is_open_for_monster(new_x, new_y):
                monster.move_to(new_x, new_y)
                return

    def _monster_attacks(self, monster: Actor) -> None:
        result = resolve_attack(monster, self.player)
        seen = monster.position in self.visible
        if result.damage:
            self.log(
                f"The {monster.name} hits you for {result.damage}."
                if seen
                else f"Something hits you for {result.damage}.",
                "rgb(255,120,120)",
            )
        elif seen:
            self.log(f"The {monster.name} attacks, but your armour holds.", "grey70")

    def _check_player_death(self) -> None:
        if self.player.is_alive or self.game_over:
            return
        self.game_over = True
        self.log("You die...", "bold rgb(255,80,80)")


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
