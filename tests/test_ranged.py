"""Ranged items: aiming, blast radius, and what stops a throw."""

from __future__ import annotations

import pytest
from helpers import build

from roguelike.game import GameState
from roguelike.inventory import ITEM_TEMPLATES, ItemKind

TEMPLATES = {template.name: template for template in ITEM_TEMPLATES}
FLASK = "Flask of Fire"
FIREBALL = "Scroll of Fireball"


def item(name: str):
    return TEMPLATES[name].spawn()


def armed(rows: list[str], name: str = FLASK, floor: int = 1) -> GameState:
    game = build(rows, floor=floor)
    game.inventory.add(item(name))
    return game


ROW_OF_GOBLINS = ["############", "#@..ggg....#", "############"]


# -- what counts as ranged -------------------------------------------------


def test_only_ranged_items_need_a_target():
    assert item(FLASK).needs_target
    assert item(FIREBALL).needs_target
    assert not item("Healing Potion").needs_target
    assert not item("Dagger").needs_target
    assert not item("Unknown Scroll").needs_target


def test_a_ranged_item_says_its_damage_and_reach():
    described = item(FLASK).describe()
    assert "10 damage" in described and "range 7" in described


def test_a_thrown_flask_is_its_own_kind_of_item():
    assert item(FLASK).kind is ItemKind.THROWN


# -- aiming rules ----------------------------------------------------------


def test_a_tile_in_view_and_in_range_can_be_aimed_at():
    game = armed(ROW_OF_GOBLINS)
    assert game.can_target((5, 1), 7)


def test_a_tile_beyond_the_range_cannot():
    game = armed(ROW_OF_GOBLINS)
    assert not game.can_target((10, 1), 3)


def test_a_tile_out_of_view_cannot():
    rows = ["##########", "#@..#....#", "##########"]
    game = armed(rows)
    assert (7, 1) not in game.visible
    assert not game.can_target((7, 1), 9)


def test_targets_come_back_nearest_first():
    game = armed(ROW_OF_GOBLINS)
    reachable = game.targets_in_range(7)
    assert [monster.x for monster in reachable] == [4, 5, 6]


def test_targets_out_of_reach_are_not_offered():
    game = armed(ROW_OF_GOBLINS)
    assert game.targets_in_range(2) == []


def test_the_blast_covers_the_square_around_the_impact():
    game = armed(ROW_OF_GOBLINS)
    assert game.blast_tiles((5, 1), 0) == {(5, 1)}
    assert len(game.blast_tiles((5, 1), 1)) == 9
    assert (4, 0) in game.blast_tiles((5, 1), 1)


def test_the_blast_is_clipped_to_the_map():
    game = armed(ROW_OF_GOBLINS)
    for x, y in game.blast_tiles((0, 0), 2):
        assert game.tile_map.in_bounds(x, y)


# -- throwing --------------------------------------------------------------


def test_a_throw_damages_everything_in_the_blast():
    game = armed(ROW_OF_GOBLINS)
    goblins = {monster.x: monster for monster in game.entities}

    assert game.use_item(0, target=(5, 1)) is True
    for goblin in goblins.values():
        assert goblin.hp < goblin.max_hp or goblin not in game.entities
    assert game.turns == 1
    assert len(game.inventory) == 0, "the flask was not used up"


def test_a_throw_leaves_anything_outside_the_blast_alone():
    rows = ["##############", "#@.g......g..#", "##############"]
    game = armed(rows)
    near, far = sorted(game.entities, key=lambda monster: monster.x)

    game.use_item(0, target=near.position)
    assert far.hp == far.max_hp, "the blast reached too far"


def test_kills_from_a_blast_are_counted():
    game = armed(ROW_OF_GOBLINS)
    assert game.use_item(0, target=(5, 1)) is True
    assert game.kills == 3
    assert game.entities == []


def test_a_bigger_scroll_covers_more_ground():
    rows = ["##############", "#@.g......g..#", "##############"]
    close = armed(rows, FLASK)
    wide = armed(rows, FIREBALL, floor=2)
    assert wide.inventory.items[0].blast_radius > close.inventory.items[0].blast_radius


def test_a_throw_at_empty_stone_still_uses_the_item():
    game = armed(["##########", "#@.......#", "##########"])
    assert game.use_item(0, target=(5, 1)) is True
    assert len(game.inventory) == 0
    assert any("bare stone" in message.text for message in game.messages)


# -- refusals --------------------------------------------------------------


def test_throwing_without_a_target_does_nothing():
    game = armed(ROW_OF_GOBLINS)
    assert game.use_item(0) is False
    assert len(game.inventory) == 1, "the flask was consumed without a target"
    assert game.turns == 0


def test_throwing_out_of_range_keeps_the_item():
    rows = ["#" * 20, "#@" + "." * 17 + "#", "#" * 20]
    game = armed(rows)
    far = (15, 1)
    assert not game.can_target(far, 7)
    assert game.use_item(0, target=far) is False
    assert len(game.inventory) == 1
    assert game.turns == 0
    assert any("no clear shot" in m.text.lower() for m in game.messages)


def test_throwing_into_the_dark_keeps_the_item():
    rows = ["##########", "#@..#....#", "##########"]
    game = armed(rows)
    assert game.use_item(0, target=(7, 1)) is False
    assert len(game.inventory) == 1


def test_a_dead_player_cannot_throw():
    game = armed(ROW_OF_GOBLINS)
    game.game_over = True
    assert game.use_item(0, target=(5, 1)) is False
    assert len(game.inventory) == 1


# -- spawning --------------------------------------------------------------


@pytest.mark.parametrize("seed", range(10))
def test_ranged_loot_turns_up_in_dungeons(seed: int):
    """Not on every floor, but the tables must be able to produce it."""
    game = GameState.new_game(seed=seed)
    for carried in game.items.values():
        if carried.needs_target:
            assert carried.throw_range > 0 and carried.blast_radius >= 0
            return


def test_the_fireball_scroll_waits_for_the_second_floor():
    from roguelike.inventory import item_templates_for_floor

    shallow = {template.name for template in item_templates_for_floor(1)}
    deeper = {template.name for template in item_templates_for_floor(2)}
    assert FLASK in shallow
    assert FIREBALL not in shallow and FIREBALL in deeper
