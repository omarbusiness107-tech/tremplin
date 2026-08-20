"""Items: picking them up, carrying them, and using them."""

from __future__ import annotations

import pytest
from helpers import ScriptedRng, build

from roguelike.game import GameState
from roguelike.inventory import (
    BACKFIRE_DAMAGE,
    FIREBALL_DAMAGE,
    ITEM_TEMPLATES,
    LIGHTNING_DAMAGE,
    SCROLL_EFFECTS,
    Inventory,
    ItemKind,
    item_templates_for_floor,
)

TEMPLATES = {template.name: template for template in ITEM_TEMPLATES}
EFFECT_INDEX = {effect.__name__: index for index, effect in enumerate(SCROLL_EFFECTS)}


def item(name: str):
    return TEMPLATES[name].spawn()


def scroll_game(rows: list[str], effect: str) -> GameState:
    """A game whose next scroll read is pinned to one specific effect."""
    game = build(rows)
    game.rng = ScriptedRng(EFFECT_INDEX[effect])
    game.inventory.add(item("Unknown Scroll"))
    return game


# -- picking things up -----------------------------------------------------


def test_walking_over_an_item_picks_it_up():
    game = build(["#####", "#@..#", "#####"])
    game.items[(2, 1)] = item("Healing Potion")

    game.move_player(1, 0)
    assert len(game.inventory) == 1
    assert game.inventory.items[0].name == "Healing Potion"
    assert (2, 1) not in game.items, "the item was left on the floor"
    assert any("pick up" in message.text for message in game.messages)


def test_a_full_pack_leaves_the_item_on_the_floor():
    game = build(["#####", "#@..#", "#####"])
    game.inventory = Inventory(capacity=1)
    game.inventory.add(item("Dagger"))
    game.items[(2, 1)] = item("Healing Potion")

    game.move_player(1, 0)
    assert (2, 1) in game.items, "the item vanished into a full pack"
    assert len(game.inventory) == 1
    assert any("pack is full" in message.text for message in game.messages)


def test_attacking_does_not_pick_up_the_item_under_the_monster():
    game = build(["#####", "#@r.#", "#####"])
    game.items[(2, 1)] = item("Healing Potion")
    game.move_player(1, 0)
    assert (2, 1) in game.items
    assert len(game.inventory) == 0


# -- potions ---------------------------------------------------------------


def test_drinking_a_potion_heals_and_empties_the_slot():
    game = build(["#####", "#@..#", "#####"])
    game.player.hp = 10
    game.inventory.add(item("Healing Potion"))

    assert game.use_item(0) is True
    assert game.player.hp == 10 + TEMPLATES["Healing Potion"].power
    assert len(game.inventory) == 0
    assert game.turns == 1


def test_healing_never_overshoots_the_maximum():
    game = build(["#####", "#@..#", "#####"])
    game.player.hp = game.player.max_hp - 2
    game.inventory.add(item("Greater Healing Potion"))
    game.use_item(0)
    assert game.player.hp == game.player.max_hp


def test_a_potion_at_full_health_is_not_wasted():
    game = build(["#####", "#@..#", "#####"])
    game.inventory.add(item("Healing Potion"))

    assert game.use_item(0) is False
    assert len(game.inventory) == 1, "the potion was consumed for nothing"
    assert game.turns == 0, "a wasted action still cost a turn"


# -- weapons ---------------------------------------------------------------


def test_wielding_a_weapon_raises_attack():
    game = build(["#####", "#@..#", "#####"])
    bare_handed = game.player.attack
    game.inventory.add(item("Dagger"))

    assert game.use_item(0) is True
    assert game.player.weapon is not None
    assert game.player.attack == bare_handed + TEMPLATES["Dagger"].power


def test_swapping_weapons_stows_the_old_one():
    game = build(["#####", "#@..#", "#####"])
    game.inventory.add(item("Dagger"))
    game.inventory.add(item("Short Sword"))

    game.use_item(0)  # dagger
    game.use_item(0)  # short sword, from the slot the dagger left
    assert game.player.weapon.name == "Short Sword"
    assert [carried.name for carried in game.inventory.items] == ["Dagger"]
    assert game.player.attack == game.player.base_attack + TEMPLATES["Short Sword"].power


def test_a_wielded_weapon_hits_harder():
    weak = build(["#####", "#@o.#", "#####"])
    strong = build(["#####", "#@o.#", "#####"])
    strong.inventory.add(item("War Hammer"))
    strong.use_item(0)

    weak.move_player(1, 0)
    strong.move_player(1, 0)
    assert strong.entities[0].hp < weak.entities[0].hp


# -- scrolls ---------------------------------------------------------------


def test_reading_a_scroll_always_consumes_it():
    for index in range(len(SCROLL_EFFECTS)):
        game = build(["######", "#@r..#", "######"])
        game.rng = ScriptedRng(index)
        game.inventory.add(item("Unknown Scroll"))
        assert game.use_item(0) is True
        assert len(game.inventory) == 0


def test_lightning_strikes_the_nearest_visible_monster():
    game = scroll_game(["######", "#@.r.#", "######"], "_scroll_lightning")
    rat = game.entities[0]
    game.use_item(0)
    # A rat has less HP than the bolt does damage, so it dies outright.
    assert rat not in game.entities and game.kills == 1
    assert LIGHTNING_DAMAGE >= rat.max_hp


def test_lightning_with_nothing_in_sight_just_fizzles():
    game = scroll_game(["#####", "#@..#", "#####"], "_scroll_lightning")
    game.use_item(0)
    assert game.kills == 0
    assert any("earths itself" in message.text for message in game.messages)


def test_fireball_burns_everything_close_by():
    game = scroll_game(["########", "#@ooo..#", "########"], "_scroll_fireball")
    near = [monster for monster in game.entities if monster.x <= 4]
    far = [monster for monster in game.entities if monster.x > 4]
    game.use_item(0)
    for monster in near:
        assert monster.hp < monster.max_hp or monster not in game.entities
    for monster in far:
        assert monster.hp == monster.max_hp, "the blast reached too far"
    assert FIREBALL_DAMAGE > 0


def test_magic_mapping_reveals_the_whole_floor():
    game = scroll_game(["#########", "#@..+...#", "#########"], "_scroll_mapping")
    before = len(game.explored)
    game.use_item(0)
    assert len(game.explored) > before
    for x in range(1, 8):
        assert (x, 1) in game.explored


def test_teleport_moves_the_player_somewhere_else():
    rows = ["############", "#@.........#", "############"]
    game = scroll_game(rows, "_scroll_teleport")
    start = game.player.position
    game.use_item(0)
    assert game.player.position != start
    assert game.tile_map.is_walkable(*game.player.position)


def test_a_blessing_permanently_raises_attack():
    game = scroll_game(["#####", "#@..#", "#####"], "_scroll_blessing")
    before = game.player.attack
    game.use_item(0)
    assert game.player.attack == before + 1
    assert game.player.base_attack == before + 1


def test_a_backfiring_scroll_hurts_the_reader():
    game = scroll_game(["#####", "#@..#", "#####"], "_scroll_backfire")
    game.use_item(0)
    assert game.player.hp == game.player.max_hp - BACKFIRE_DAMAGE


# -- the pack --------------------------------------------------------------


def test_using_an_empty_or_out_of_range_slot_does_nothing():
    game = build(["#####", "#@..#", "#####"])
    assert game.use_item(0) is False
    assert game.use_item(-1) is False
    assert game.use_item(99) is False
    assert game.turns == 0


def test_a_dead_player_cannot_use_items():
    game = build(["#####", "#@..#", "#####"])
    game.inventory.add(item("Healing Potion"))
    game.player.hp = 1
    game.game_over = True
    assert game.use_item(0) is False


def test_using_an_item_gives_the_dungeon_its_turn():
    game = build(["#####", "#@r.#", "#####"])
    game.player.hp = 10
    game.inventory.add(item("Healing Potion"))
    game.use_item(0)
    # Healed by the potion, then bitten by the rat that was standing next to us.
    assert game.turns == 1
    assert any("hits you" in message.text for message in game.messages)


def test_pack_slots_are_lettered_in_order():
    pack = Inventory()
    pack.add(item("Dagger"))
    pack.add(item("Healing Potion"))
    assert [letter for letter, _ in pack.slots()] == ["a", "b"]
    assert Inventory.slot_index("a") == 0
    assert Inventory.slot_index("c") == 2
    assert Inventory.slot_index("?") is None


def test_items_describe_what_they_do():
    assert "heals" in item("Healing Potion").describe()
    assert "+2 attack" in item("Dagger").describe()
    assert item("Unknown Scroll").describe() == "Unknown Scroll"


# -- what spawns where -----------------------------------------------------


@pytest.mark.parametrize("seed", range(15))
def test_loot_lands_on_open_ground_clear_of_the_stairs(seed: int):
    game = GameState.new_game(seed=seed)
    assert game.items, "the floor holds no loot at all"
    for position, carried in game.items.items():
        assert game.tile_map.is_walkable(*position)
        assert position != game.player.position
        assert position != game.stairs, "loot was dropped on the stairs"
        assert carried.kind in ItemKind


@pytest.mark.parametrize("seed", range(15))
def test_every_floor_holds_at_least_one_weapon(seed: int):
    """The player's attack only grows through weapons, so one is guaranteed."""
    game = GameState.new_game(seed=seed)
    kinds = [carried.kind for carried in game.items.values()]
    assert ItemKind.WEAPON in kinds


def test_better_gear_only_appears_deeper_down():
    shallow = {template.name for template in item_templates_for_floor(1)}
    deep = {template.name for template in item_templates_for_floor(6)}
    assert "Rune Blade" not in shallow
    assert "Rune Blade" in deep
    assert shallow < deep
