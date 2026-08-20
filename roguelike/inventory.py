"""Items: what they are, and what happens when you use one.

An item's effect is written against :class:`~roguelike.game.GameState`, so it
can heal the player, hurt monsters, or redraw the map. The import is guarded by
``TYPE_CHECKING`` because ``game`` imports this module, not the other way round.

Every effect draws its randomness from ``game.rng``, so a run replays exactly.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover - import cycle guard
    from .game import GameState

#: Colours used for the item glyphs on the map and in the pack.
POTION_COLOR = "rgb(226,120,190)"
WEAPON_COLOR = "rgb(150,200,230)"
SCROLL_COLOR = "rgb(235,230,200)"
THROWN_COLOR = "rgb(255,140,80)"

LIGHTNING_DAMAGE = 12
FIREBALL_DAMAGE = 7
FIREBALL_RADIUS = 3
BLESSING_ATTACK = 1
BACKFIRE_DAMAGE = 4


class ItemKind(str, Enum):
    """What sort of thing an item is, which decides how using it behaves."""

    POTION = "potion"
    WEAPON = "weapon"
    SCROLL = "scroll"
    THROWN = "thrown"


@dataclass
class Item:
    """One item, either lying on the floor or carried in the pack."""

    name: str
    char: str
    color: str
    kind: ItemKind
    #: HP restored for a potion, attack bonus for a weapon, damage for a blast.
    power: int = 0
    #: How far this item can be thrown or aimed. 0 means it is used in place.
    throw_range: int = 0
    #: Tiles either side of the impact point that also take the hit.
    blast_radius: int = 0

    @property
    def needs_target(self) -> bool:
        """True when using this item means picking a spot on the map first."""
        return self.throw_range > 0

    def use(self, game: GameState, target: tuple[int, int] | None = None) -> bool:
        """Use this item, at ``target`` if it is one that must be aimed.

        Returns True when the item should leave the pack — drunk, read, thrown,
        or (for a weapon) moved into the player's hand. Returns False when
        nothing happened, in which case no turn is spent either.
        """
        if self.needs_target:
            return _hurl(game, self, target)
        if self.kind is ItemKind.POTION:
            return _drink(game, self)
        if self.kind is ItemKind.WEAPON:
            return _equip(game, self)
        return _read_scroll(game, self)

    def describe(self) -> str:
        """Short label for the inventory screen."""
        if self.needs_target:
            return f"{self.name} ({self.power} damage, range {self.throw_range})"
        if self.kind is ItemKind.POTION:
            return f"{self.name} (heals {self.power})"
        if self.kind is ItemKind.WEAPON:
            return f"{self.name} (+{self.power} attack)"
        return self.name


# -- item effects ----------------------------------------------------------


def _drink(game: GameState, item: Item) -> bool:
    healed = game.player.heal(item.power)
    if healed == 0:
        game.log("You are already at full health.", "grey70")
        return False
    game.log(f"You drink the {item.name} and recover {healed} HP.", POTION_COLOR)
    return True


def _equip(game: GameState, item: Item) -> bool:
    previous = game.player.equip(item)
    game.log(f"You wield the {item.name}. Attack is now {game.player.attack}.",
             WEAPON_COLOR)
    if previous is not None:
        game.inventory.add(previous)
        game.log(f"You stow the {previous.name}.", "grey70")
    return True


def _hurl(game: GameState, item: Item, target: tuple[int, int] | None) -> bool:
    """Throw or aim ``item`` at ``target``, hitting everything in the blast."""
    if target is None or not game.can_target(target, item.throw_range):
        game.log("You have no clear shot there.", "grey70")
        return False

    caught = [
        monster
        for monster in game.entities
        if monster.is_alive
        and max(abs(monster.x - target[0]), abs(monster.y - target[1]))
        <= item.blast_radius
    ]
    game.log(f"The {item.name} bursts!", "rgb(255,150,80)")
    if not caught:
        game.log("It goes off against bare stone.", "grey70")
        return True

    for monster in caught:
        game.log(
            f"The blast catches the {monster.name} for {item.power}.",
            "rgb(255,180,110)",
        )
        game.hurt_monster(monster, item.power)
    return True


def _scroll_lightning(game: GameState) -> None:
    target = game.nearest_visible_monster()
    if target is None:
        game.log("The scroll crackles, and the charge earths itself.", "grey70")
        return
    game.log(
        f"Lightning arcs into the {target.name} for {LIGHTNING_DAMAGE} damage!",
        "rgb(180,200,255)",
    )
    game.hurt_monster(target, LIGHTNING_DAMAGE)


def _scroll_fireball(game: GameState) -> None:
    targets = [
        monster
        for monster in game.entities
        if monster.is_alive
        and monster.distance_to(game.player) <= FIREBALL_RADIUS
    ]
    game.log("The scroll erupts in a roaring fireball!", "rgb(255,150,80)")
    if not targets:
        game.log("Nothing is close enough to burn.", "grey70")
        return
    for monster in targets:
        game.hurt_monster(monster, FIREBALL_DAMAGE)


def _scroll_mapping(game: GameState) -> None:
    game.reveal_floor()
    game.log("The floor plan burns itself into your mind.", "rgb(150,200,255)")


def _scroll_teleport(game: GameState) -> None:
    if game.teleport_player():
        game.log("The world lurches, and you are somewhere else.", "rgb(190,160,255)")
    else:
        game.log("The scroll fizzles; you stay exactly where you are.", "grey70")


def _scroll_blessing(game: GameState) -> None:
    game.player.base_attack += BLESSING_ATTACK
    game.player.refresh_attack()
    game.log(
        f"A blessing settles on you. Attack is now {game.player.attack}.",
        "rgb(255,225,140)",
    )


def _scroll_backfire(game: GameState) -> None:
    game.hurt_player(BACKFIRE_DAMAGE, "their own scroll")
    game.log(
        f"The scroll backfires, searing you for {BACKFIRE_DAMAGE} damage!",
        "rgb(255,120,120)",
    )


#: Every outcome of reading an unknown scroll, chosen with ``game.rng``.
SCROLL_EFFECTS = (
    _scroll_lightning,
    _scroll_fireball,
    _scroll_mapping,
    _scroll_teleport,
    _scroll_blessing,
    _scroll_backfire,
)


def _read_scroll(game: GameState, item: Item) -> bool:
    effect = game.rng.choice(SCROLL_EFFECTS)
    effect(game)
    return True


# -- what can spawn --------------------------------------------------------


@dataclass(frozen=True)
class ItemTemplate:
    """An item type, and the floors it can be found on."""

    name: str
    char: str
    color: str
    kind: ItemKind
    power: int = 0
    throw_range: int = 0
    blast_radius: int = 0
    weight: int = 10
    min_floor: int = 1

    def spawn(self) -> Item:
        return Item(
            name=self.name,
            char=self.char,
            color=self.color,
            kind=self.kind,
            power=self.power,
            throw_range=self.throw_range,
            blast_radius=self.blast_radius,
        )


ITEM_TEMPLATES: tuple[ItemTemplate, ...] = (
    ItemTemplate("Healing Potion", "!", POTION_COLOR, ItemKind.POTION,
                 power=12, weight=12, min_floor=1),
    ItemTemplate("Greater Healing Potion", "!", POTION_COLOR, ItemKind.POTION,
                 power=26, weight=5, min_floor=3),
    ItemTemplate("Unknown Scroll", "?", SCROLL_COLOR, ItemKind.SCROLL,
                 weight=9, min_floor=1),
    # Ranged: these are aimed at a spot on the map rather than used in place.
    ItemTemplate("Flask of Fire", "!", THROWN_COLOR, ItemKind.THROWN,
                 power=10, throw_range=7, blast_radius=1, weight=7, min_floor=1),
    ItemTemplate("Scroll of Fireball", "?", SCROLL_COLOR, ItemKind.SCROLL,
                 power=9, throw_range=9, blast_radius=2, weight=6, min_floor=2),
    # Each weapon tier unlocks a floor before the monster it is meant to answer,
    # so the player can be armed for an Orc, Ogre or Wraith before meeting one.
    ItemTemplate("Dagger", "/", WEAPON_COLOR, ItemKind.WEAPON,
                 power=2, weight=8, min_floor=1),
    ItemTemplate("Short Sword", "/", WEAPON_COLOR, ItemKind.WEAPON,
                 power=4, weight=7, min_floor=2),
    ItemTemplate("War Hammer", "/", WEAPON_COLOR, ItemKind.WEAPON,
                 power=7, weight=6, min_floor=3),
    ItemTemplate("Rune Blade", "/", WEAPON_COLOR, ItemKind.WEAPON,
                 power=10, weight=5, min_floor=5),
)


def item_templates_for_floor(floor: int) -> list[ItemTemplate]:
    """The item types that can be found on ``floor``."""
    return [template for template in ITEM_TEMPLATES if template.min_floor <= floor]


# -- the pack --------------------------------------------------------------

#: Letters used to select items on the inventory screen.
SLOT_LETTERS = "abcdefghijklmnop"


@dataclass
class Inventory:
    """A fixed-capacity pack."""

    capacity: int = len(SLOT_LETTERS)
    items: list[Item] = field(default_factory=list)

    def __len__(self) -> int:
        return len(self.items)

    @property
    def is_full(self) -> bool:
        return len(self.items) >= self.capacity

    def add(self, item: Item) -> bool:
        """Store ``item``; returns False when the pack is already full."""
        if self.is_full:
            return False
        self.items.append(item)
        return True

    def remove(self, item: Item) -> bool:
        """Drop ``item`` from the pack; returns False when it was not carried."""
        if item not in self.items:
            return False
        self.items.remove(item)
        return True

    def slots(self) -> list[tuple[str, Item]]:
        """The carried items, each paired with its selection letter."""
        return list(zip(SLOT_LETTERS, self.items))

    @staticmethod
    def slot_index(letter: str) -> int | None:
        """The pack position a letter refers to, or None if it is not a slot."""
        index = SLOT_LETTERS.find(letter)
        return index if index >= 0 else None
