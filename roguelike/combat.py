"""Melee combat resolution.

Kept free of I/O and free of module-level randomness so fights can be replayed
exactly from a seed. Wired into the UI in step 6 (entities & combat); the
resolution rules live here so they can be unit tested on their own.
"""

from __future__ import annotations

from dataclasses import dataclass

from .entities import Actor


@dataclass(frozen=True)
class AttackResult:
    """What one melee swing did."""

    attacker: str
    defender: str
    damage: int
    killed: bool

    def describe(self) -> str:
        if self.damage == 0:
            return f"{self.attacker} attacks {self.defender} but does no damage."
        text = f"{self.attacker} hits {self.defender} for {self.damage} damage."
        if self.killed:
            text += f" {self.defender} dies!"
        return text


def damage_for(attacker: Actor, defender: Actor) -> int:
    """Damage a swing deals: attack minus defense, never below zero."""
    return max(0, attacker.attack - defender.defense)


def resolve_attack(attacker: Actor, defender: Actor) -> AttackResult:
    """Apply one melee attack from ``attacker`` to ``defender``."""
    dealt = defender.take_damage(damage_for(attacker, defender))
    return AttackResult(
        attacker=attacker.name,
        defender=defender.name,
        damage=dealt,
        killed=not defender.is_alive,
    )
