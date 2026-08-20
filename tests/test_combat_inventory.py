"""Combat resolution and the inventory container."""

from __future__ import annotations

from roguelike.combat import damage_for, resolve_attack
from roguelike.entities import Actor, make_player
from roguelike.inventory import Inventory, Item, ItemKind


def monster(hp: int = 10, attack: int = 3, defense: int = 0) -> Actor:
    return Actor(
        x=0, y=0, char="g", name="Goblin",
        hp=hp, max_hp=hp, attack=attack, defense=defense,
    )


def test_damage_subtracts_defense_and_never_goes_negative():
    assert damage_for(monster(attack=6), monster(defense=2)) == 4
    assert damage_for(monster(attack=1), monster(defense=9)) == 0


def test_attack_reduces_hp_and_reports_the_hit():
    goblin = monster(hp=10)
    result = resolve_attack(make_player(0, 0), goblin)
    assert result.damage == 5 and goblin.hp == 5
    assert not result.killed
    assert "Goblin" in result.describe()


def test_lethal_attack_is_reported_as_a_kill():
    goblin = monster(hp=3)
    result = resolve_attack(make_player(0, 0), goblin)
    assert goblin.hp == 0 and not goblin.is_alive
    assert result.killed and result.damage == 3  # damage is capped at the kill


def test_healing_stops_at_max_hp():
    player = make_player(0, 0)
    player.take_damage(10)
    assert player.heal(100) == 10 and player.hp == player.max_hp


def make_item(name: str, char: str, kind: ItemKind = ItemKind.POTION) -> Item:
    return Item(name=name, char=char, color="white", kind=kind, power=1)


def test_inventory_add_remove_and_capacity():
    pack = Inventory(capacity=2)
    potion, sword = make_item("Potion", "!"), make_item("Sword", "/", ItemKind.WEAPON)
    assert pack.add(potion) and pack.add(sword)
    assert pack.is_full and len(pack) == 2
    assert pack.add(make_item("Scroll", "?", ItemKind.SCROLL)) is False
    assert pack.remove(potion) and len(pack) == 1
    assert pack.remove(potion) is False


def test_distance_is_chebyshev():
    a, b = monster(), monster()
    b.move_to(3, 4)
    assert a.distance_to(b) == 4
