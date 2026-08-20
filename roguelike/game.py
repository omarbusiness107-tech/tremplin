"""The single source of truth for a run: :class:`GameState`.

All mutable game data lives on one ``GameState`` instance — there are no module
level globals — and every random decision is drawn from ``GameState.rng``, a
seeded ``random.Random``. Give the same seed twice and play the same keys and
you get the same dungeons, monsters, loot and outcome, all the way down.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from random import Random

from .combat import resolve_attack
from .entities import (
    Actor,
    Player,
    make_player,
    templates_for_floor,
    with_article,
)
from .fov import compute_fov, line_of_sight
from .inventory import Inventory, Item, ItemKind, item_templates_for_floor
from .map_gen import STAIRS_DOWN, Rect, TileMap, generate_dungeon

MAP_WIDTH = 80
MAP_HEIGHT = 45

#: How far the player can see, in tiles.
FOV_RADIUS = 9

#: Monster count scales with the size of the floor, so a big dungeon does not
#: end up feeling empty, plus a flat bonus for each floor descended.
MIN_MONSTERS = 4
ROOMS_PER_MONSTER = 3
MONSTERS_PER_FLOOR = 1

#: Taking the stairs is also a chance to catch your breath. Healing only on
#: descent (rather than every turn) means it cannot be farmed by waiting.
DESCENT_HEAL_FRACTION = 0.35

#: Loot scales the same way, and deeper floors are a little richer.
MIN_ITEMS = 3
ROOMS_PER_ITEM = 3
FLOORS_PER_EXTRA_ITEM = 2

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
    items_found: int = 0
    game_over: bool = False
    #: What landed the killing blow, once the run is over.
    killed_by: str | None = None
    width: int = MAP_WIDTH
    height: int = MAP_HEIGHT
    entities: list[Actor] = field(default_factory=list)
    #: Items lying on the floor, keyed by the tile they rest on.
    items: dict[tuple[int, int], Item] = field(default_factory=dict)
    inventory: Inventory = field(default_factory=Inventory)
    #: Where the stairs down are on this floor.
    stairs: tuple[int, int] | None = None
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
        # The player is placed properly by the first _generate_floor call.
        game = cls(
            seed=seed,
            rng=rng,
            tile_map=TileMap.filled(width, height),
            player=make_player(0, 0),
            width=width,
            height=height,
        )
        game.generate_floor()
        game.log("You descend into the dungeon.", "rgb(150,200,255)")
        return game

    # -- logging ---------------------------------------------------------

    def log(self, text: str, color: str = "white") -> None:
        self.messages.append(Message(text, color))
        del self.messages[:-MAX_MESSAGES]

    def recent_messages(self, count: int) -> list[Message]:
        """The last ``count`` log lines, oldest first."""
        return self.messages[-count:] if count > 0 else []

    # -- building a floor ------------------------------------------------

    def generate_floor(self) -> None:
        """Lay out the current floor and drop the player at its entrance.

        The player themself carries over untouched — HP, pack, and weapon — so
        this is equally the start of a run and the arrival on a deeper floor.
        """
        self.tile_map = generate_dungeon(self.width, self.height, self.rng)
        self.player.move_to(*self.tile_map.rooms[0].center)
        self.stairs = self._place_stairs()
        self.entities = self._spawn_monsters()
        self.items = self._spawn_items()
        self.visible = set()
        self.explored = set()
        self.update_fov()

    def _place_stairs(self) -> tuple[int, int] | None:
        """Put the stairs down in the room furthest from where the player lands.

        Anything closer would let the player skip most of the floor.
        """
        rooms = self.tile_map.rooms
        if not rooms:
            return None
        start = rooms[0].center
        candidates = rooms[1:] or rooms
        furthest = max(
            candidates,
            key=lambda room: (room.center[0] - start[0]) ** 2
            + (room.center[1] - start[1]) ** 2,
        )
        position = furthest.center
        self.tile_map.set(*position, STAIRS_DOWN)
        return position

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
            monsters.append(template.spawn(*spot, floor=self.floor))
        return monsters

    def _spawn_items(self) -> dict[tuple[int, int], Item]:
        """Scatter loot across the floor, never on top of the stairs."""
        templates = item_templates_for_floor(self.floor)
        rooms = self.tile_map.rooms
        if not rooms or not templates:
            return {}

        weights = [template.weight for template in templates]
        count = max(MIN_ITEMS, len(rooms) // ROOMS_PER_ITEM)
        count += (self.floor - 1) // FLOORS_PER_EXTRA_ITEM

        taken = {self.player.position}
        if self.stairs is not None:
            taken.add(self.stairs)

        # The player's attack only grows by finding a better weapon, so every
        # floor is guaranteed to hold at least one rather than leaving the whole
        # power curve to chance.
        weapons = [t for t in templates if t.kind is ItemKind.WEAPON]
        weapon_weights = [template.weight for template in weapons]

        items: dict[tuple[int, int], Item] = {}
        for index in range(count):
            spot = self._free_spot_in(self.rng.choice(rooms), taken)
            if spot is None:
                continue
            taken.add(spot)
            if index == 0 and weapons:
                choices, choice_weights = weapons, weapon_weights
            else:
                choices, choice_weights = templates, weights
            items[spot] = self.rng.choices(choices, weights=choice_weights, k=1)[0].spawn()
        return items

    def _free_spot_in(
        self,
        room: Rect,
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

    def nearest_visible_monster(self) -> Actor | None:
        """The closest monster in view, if there is one."""
        seen = self.visible_monsters()
        if not seen:
            return None
        return min(seen, key=lambda monster: monster.distance_to(self.player))

    def reveal_floor(self) -> None:
        """Mark the whole floor explored — every room, corridor, and wall."""
        for y in range(self.tile_map.height):
            for x in range(self.tile_map.width):
                if not self.tile_map.is_walkable(x, y):
                    continue
                self.explored.add((x, y))
                # Include the walls around it, so rooms read as rooms.
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        if self.tile_map.in_bounds(x + dx, y + dy):
                            self.explored.add((x + dx, y + dy))

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

    def on_stairs(self) -> bool:
        return self.stairs is not None and self.player.position == self.stairs

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
            self._pick_up()
        else:
            return False

        self._end_turn()
        return True

    def move_player_in_direction(self, direction: str) -> bool:
        """Step the player one tile in a named direction ('up', 'left', ...)."""
        dx, dy = DIRECTIONS[direction]
        return self.move_player(dx, dy)

    def wait(self) -> bool:
        """Stand still and let the dungeon take its turn."""
        if self.game_over:
            return False
        self._end_turn()
        return True

    def use_item(self, index: int) -> bool:
        """Use the item in pack slot ``index``. True when a turn was spent."""
        if self.game_over or not 0 <= index < len(self.inventory):
            return False

        item = self.inventory.items[index]
        # Take it out first so an effect that stows a swapped-out weapon has
        # room for it, then put it back if nothing actually happened.
        self.inventory.remove(item)
        if not item.use(self):
            self.inventory.add(item)
            return False

        self._end_turn()
        return True

    def descend(self) -> bool:
        """Take the stairs down to a deeper, meaner floor."""
        if self.game_over:
            return False
        if not self.on_stairs():
            self.log("There are no stairs here.", "grey70")
            return False

        self.floor += 1
        self.generate_floor()
        self.turns += 1
        self.log(f"You descend to floor {self.floor}.", "rgb(150,200,255)")

        rested = self.player.heal(round(self.player.max_hp * DESCENT_HEAL_FRACTION))
        if rested:
            self.log(f"You rest on the way down and recover {rested} HP.",
                     "rgb(120,220,160)")
        return True

    def _pick_up(self) -> None:
        """Take whatever is lying on the player's tile, if it fits."""
        item = self.items.get(self.player.position)
        if item is None:
            return
        if self.inventory.is_full:
            self.log(
                f"Your pack is full; the {item.name} stays on the floor.", "grey70"
            )
            return
        del self.items[self.player.position]
        self.inventory.add(item)
        self.items_found += 1
        self.log(f"You pick up the {item.name}.", item.color)

    def _player_attacks(self, target: Actor) -> None:
        result = resolve_attack(self.player, target)
        self.log(
            f"You hit the {target.name} for {result.damage}."
            if result.damage
            else f"You hit the {target.name}, but it shrugs it off.",
            "rgb(255,220,120)",
        )
        if result.killed:
            self._monster_died(target)

    def hurt_monster(self, monster: Actor, amount: int) -> int:
        """Damage ``monster`` outside melee — a scroll, say. Returns damage dealt."""
        dealt = monster.take_damage(amount)
        if not monster.is_alive:
            self._monster_died(monster)
        return dealt

    def _monster_died(self, monster: Actor) -> None:
        """Book-keeping for a kill, however it was dealt."""
        self.kills += 1
        if monster in self.entities:
            self.entities.remove(monster)
        self.log(f"The {monster.name} dies!", "rgb(120,220,160)")

    def hurt_player(self, amount: int, source: str) -> int:
        """Damage the player, remembering what did it in case it kills them."""
        dealt = self.player.take_damage(amount)
        if not self.player.is_alive and self.killed_by is None:
            self.killed_by = source
        return dealt

    def teleport_player(self) -> bool:
        """Drop the player on a random free tile. False if there is nowhere."""
        candidates = [
            (x, y)
            for y in range(self.tile_map.height)
            for x in range(self.tile_map.width)
            if self.tile_map.is_walkable(x, y)
            and (x, y) != self.player.position
            and self.blocking_entity_at(x, y) is None
        ]
        if not candidates:
            return False
        self.player.move_to(*self.rng.choice(candidates))
        self._pick_up()
        self.update_fov()
        return True

    # -- turn loop -------------------------------------------------------

    def _end_turn(self) -> None:
        """Close out a player action: the dungeon moves, then we look around."""
        self.turns += 1
        self._monsters_take_turn()
        self.update_fov()
        self._check_player_death()

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
        if result.killed and self.killed_by is None:
            self.killed_by = with_article(monster.name)
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

    # -- the run, once it is over ----------------------------------------

    @property
    def floors_cleared(self) -> int:
        """Floors left behind. Dying on floor 3 means two were cleared."""
        return self.floor - 1

    def run_summary(self) -> list[tuple[str, str]]:
        """The run's final numbers, ready to print on the game over screen."""
        weapon = self.player.weapon.name if self.player.weapon else "bare hands"
        return [
            ("Floors cleared", str(self.floors_cleared)),
            ("Deepest floor", str(self.floor)),
            ("Monsters slain", str(self.kills)),
            ("Turns survived", str(self.turns)),
            ("Items found", str(self.items_found)),
            ("Final attack", str(self.player.attack)),
            ("Wielding", weapon),
            ("Killed by", self.killed_by or "unknown"),
            ("Seed", str(self.seed)),
        ]


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
