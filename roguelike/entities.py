"""Things that occupy a tile: the player, and (from step 6) monsters."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Entity:
    """Anything drawn on the map at a single tile position."""

    x: int
    y: int
    char: str
    name: str
    color: str = "white"
    blocks: bool = True

    @property
    def position(self) -> tuple[int, int]:
        return self.x, self.y

    def move_to(self, x: int, y: int) -> None:
        self.x = x
        self.y = y

    def distance_to(self, other: Entity) -> int:
        """Chebyshev distance, matching the 8-way grid the game plays on."""
        return max(abs(self.x - other.x), abs(self.y - other.y))


@dataclass
class Actor(Entity):
    """An entity with combat stats. Base class for the player and monsters."""

    hp: int = 1
    max_hp: int = 1
    attack: int = 1
    defense: int = 0

    @property
    def is_alive(self) -> bool:
        return self.hp > 0

    def take_damage(self, amount: int) -> int:
        """Apply ``amount`` damage and return how much was actually dealt."""
        dealt = max(0, min(amount, self.hp))
        self.hp -= dealt
        return dealt

    def heal(self, amount: int) -> int:
        """Restore up to ``amount`` HP and return how much was actually healed."""
        healed = max(0, min(amount, self.max_hp - self.hp))
        self.hp += healed
        return healed


@dataclass
class Player(Actor):
    """The player character."""

    char: str = "@"
    name: str = "Player"
    color: str = "bright_yellow"
    hp: int = 30
    max_hp: int = 30
    attack: int = 5
    defense: int = 1


@dataclass
class Monster(Actor):
    """A hostile actor that hunts the player on sight."""

    sight_radius: int = 8


@dataclass(frozen=True)
class MonsterTemplate:
    """A monster species, and the floors it shows up on."""

    name: str
    char: str
    color: str
    hp: int
    attack: int
    defense: int
    sight_radius: int = 8
    min_floor: int = 1
    weight: int = 10

    def spawn(self, x: int, y: int) -> Monster:
        return Monster(
            x=x,
            y=y,
            char=self.char,
            name=self.name,
            color=self.color,
            hp=self.hp,
            max_hp=self.hp,
            attack=self.attack,
            defense=self.defense,
            sight_radius=self.sight_radius,
        )


MONSTER_TEMPLATES: tuple[MonsterTemplate, ...] = (
    MonsterTemplate(
        name="Rat", char="r", color="rgb(150,140,120)",
        hp=4, attack=2, defense=0, sight_radius=6, min_floor=1, weight=10,
    ),
    MonsterTemplate(
        name="Goblin", char="g", color="rgb(110,190,90)",
        hp=8, attack=4, defense=0, sight_radius=8, min_floor=1, weight=8,
    ),
    MonsterTemplate(
        name="Orc", char="o", color="rgb(220,110,80)",
        hp=14, attack=6, defense=1, sight_radius=8, min_floor=2, weight=6,
    ),
)


def templates_for_floor(floor: int) -> list[MonsterTemplate]:
    """The species that can appear on ``floor``."""
    return [t for t in MONSTER_TEMPLATES if t.min_floor <= floor]


def make_player(x: int, y: int) -> Player:
    """A fresh player at full health standing on (x, y)."""
    return Player(x=x, y=y)
