"""Carried items.

Only the container lives here so far; items themselves (potions, weapons,
scrolls) arrive in step 7. Nothing in this module touches the UI.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Item:
    """A thing that can sit on the floor or in a pack."""

    name: str
    char: str
    color: str = "white"


@dataclass
class Inventory:
    """A fixed-capacity pack."""

    capacity: int = 16
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
