"""Things that occupy a tile: the player, and (from step 6) monsters."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover - import cycle guard
    from .inventory import Item


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
    """The player character.

    ``attack`` is derived: it is ``base_attack`` plus whatever the wielded
    weapon adds. Anything that changes either one calls :meth:`refresh_attack`,
    so combat can keep reading the plain ``attack`` field.
    """

    char: str = "@"
    name: str = "Player"
    color: str = "bright_yellow"
    hp: int = 30
    max_hp: int = 30
    attack: int = 5
    defense: int = 1
    #: Attack with bare hands, before any weapon.
    base_attack: int = 5
    weapon: "Item | None" = None
    #: Character level, and experience earned towards the next one.
    level: int = 1
    xp: int = 0

    @property
    def xp_to_next_level(self) -> int:
        """Experience still needed before the next level."""
        return max(0, xp_for_level(self.level) - self.xp)

    def gain_xp(self, amount: int) -> int:
        """Bank ``amount`` experience, returning how many levels it bought.

        Levelling grants health outright as well as raising the maximum, so a
        hard-won kill can be what carries you into the next fight.
        """
        if amount <= 0:
            return 0
        self.xp += amount
        gained = 0
        while self.xp >= xp_for_level(self.level):
            self.xp -= xp_for_level(self.level)
            self.level += 1
            gained += 1
            self._apply_level_bonuses()
        return gained

    def _apply_level_bonuses(self) -> None:
        self.max_hp += HP_PER_LEVEL
        self.hp += HP_PER_LEVEL
        if self.level % LEVELS_PER_ATTACK == 0:
            self.base_attack += 1
        if self.level % LEVELS_PER_DEFENSE == 0:
            self.defense += 1
        self.refresh_attack()

    def refresh_attack(self) -> None:
        """Recompute ``attack`` from the base value and the wielded weapon."""
        self.attack = self.base_attack + (self.weapon.power if self.weapon else 0)

    def equip(self, weapon: "Item") -> "Item | None":
        """Wield ``weapon``, returning whatever was in hand before."""
        previous = self.weapon
        self.weapon = weapon
        self.refresh_attack()
        return previous


class Behaviour(str, Enum):
    """How a species acts on its turn.

    Stats alone make deeper monsters bigger; behaviour is what makes them feel
    different to fight.
    """

    #: Walks straight at the player whenever it can see them.
    HUNTER = "hunter"
    #: Hunts while healthy, but breaks and runs once badly hurt.
    SKITTISH = "skittish"
    #: Heavy and slow: acts only every other turn, but hits hard.
    SLOW = "slow"
    #: Remembers where the player was and keeps coming after losing sight.
    STALKER = "stalker"


#: A skittish monster runs once its health drops below this fraction.
FLEE_THRESHOLD = 0.35

#: Every this many floors down, everything that lives there hits one harder.
DEPTH_PER_ATTACK = 2

# -- character progression -------------------------------------------------

#: Experience needed to leave level N is ``XP_PER_LEVEL * N``, so each level
#: costs more than the one before it.
XP_PER_LEVEL = 60
#: Maximum health gained with every level, granted as healing too.
HP_PER_LEVEL = 5
#: A point of attack every this many levels, and a point of defense likewise.
LEVELS_PER_ATTACK = 2
LEVELS_PER_DEFENSE = 3


def xp_for_level(level: int) -> int:
    """Experience needed to advance from ``level`` to the next one."""
    return XP_PER_LEVEL * level


def xp_value(monster: "Actor") -> int:
    """What killing ``monster`` is worth.

    Derived from the stats it actually spawned with rather than a number on the
    species, so the tougher specimens found deeper down are worth more without
    the tables needing a second set of figures.
    """
    return monster.max_hp + monster.attack * 2 + monster.defense * 3


@dataclass
class Monster(Actor):
    """A hostile actor that hunts the player on sight."""

    sight_radius: int = 8
    behaviour: Behaviour = Behaviour.HUNTER
    #: Where the player was last seen, for a stalker that lost them.
    last_seen: tuple[int, int] | None = None
    #: Set on the turns a slow monster spends catching its breath.
    resting: bool = False

    @property
    def is_hurt(self) -> bool:
        """True once this monster is wounded badly enough to lose its nerve."""
        return self.hp <= self.max_hp * FLEE_THRESHOLD


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
    behaviour: Behaviour = Behaviour.HUNTER
    min_floor: int = 1
    #: Last floor this species is still found on; None means all the way down.
    max_floor: int | None = None
    weight: int = 10

    def spawn(self, x: int, y: int, floor: int = 1) -> Monster:
        """One monster of this species, toughened by how deep it was found.

        A species keeps appearing for several floors after it first shows up,
        so the ones met deeper down are veterans: a little more HP, and more
        damage every third floor. On top of that everything hits harder the
        further down it is found, which is what keeps pace with the player's
        own levelling — without it, descending would make the game easier.
        """
        depth = max(0, floor - self.min_floor)
        hp = self.hp + depth
        return Monster(
            x=x,
            y=y,
            char=self.char,
            name=self.name,
            color=self.color,
            hp=hp,
            max_hp=hp,
            attack=self.attack + depth // 3 + (floor - 1) // DEPTH_PER_ATTACK,
            defense=self.defense,
            sight_radius=self.sight_radius,
            behaviour=self.behaviour,
        )


MONSTER_TEMPLATES: tuple[MonsterTemplate, ...] = (
    MonsterTemplate(
        name="Rat", char="r", color="rgb(150,140,120)",
        hp=4, attack=2, defense=0, sight_radius=6,
        behaviour=Behaviour.SKITTISH, min_floor=1, max_floor=5, weight=10,
    ),
    MonsterTemplate(
        name="Goblin", char="g", color="rgb(110,190,90)",
        hp=8, attack=3, defense=0, sight_radius=8,
        behaviour=Behaviour.HUNTER, min_floor=1, max_floor=8, weight=8,
    ),
    MonsterTemplate(
        name="Orc", char="o", color="rgb(220,110,80)",
        hp=12, attack=5, defense=1, sight_radius=8,
        behaviour=Behaviour.HUNTER, min_floor=2, weight=8,
    ),
    MonsterTemplate(
        name="Ogre", char="O", color="rgb(200,80,140)",
        hp=20, attack=10, defense=2, sight_radius=8,
        behaviour=Behaviour.SLOW, min_floor=4, weight=6,
    ),
    MonsterTemplate(
        name="Wraith", char="W", color="rgb(160,140,235)",
        hp=18, attack=7, defense=3, sight_radius=11,
        behaviour=Behaviour.STALKER, min_floor=6, weight=6,
    ),
)


def templates_for_floor(floor: int) -> list[MonsterTemplate]:
    """The species that can appear on ``floor``.

    Weak species drop out as the dungeon deepens, so descending shifts the mix
    rather than just piling more rats on top.
    """
    return [
        template
        for template in MONSTER_TEMPLATES
        if template.min_floor <= floor
        and (template.max_floor is None or floor <= template.max_floor)
    ]


def with_article(name: str) -> str:
    """``"Orc"`` -> ``"an Orc"``, ``"Goblin"`` -> ``"a Goblin"``."""
    article = "an" if name[:1].lower() in "aeiou" else "a"
    return f"{article} {name}"


def make_player(x: int, y: int) -> Player:
    """A fresh player at full health standing on (x, y)."""
    return Player(x=x, y=y)
