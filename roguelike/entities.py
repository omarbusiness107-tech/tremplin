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


def make_player(x: int, y: int) -> Player:
    """A fresh player at full health standing on (x, y)."""
    return Player(x=x, y=y)
