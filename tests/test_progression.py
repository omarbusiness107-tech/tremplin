"""Character levelling: earning experience, and what it buys."""

from __future__ import annotations

import math

import pytest
from helpers import build

from roguelike.entities import (
    HP_PER_LEVEL,
    LEVELS_PER_ATTACK,
    LEVELS_PER_DEFENSE,
    MONSTER_TEMPLATES,
    Behaviour,
    make_player,
    templates_for_floor,
    xp_for_level,
    xp_value,
)
from roguelike.game import GameState
from roguelike.inventory import ITEM_TEMPLATES

ITEMS = {template.name: template for template in ITEM_TEMPLATES}


def levelled(level: int):
    """A player advanced to ``level`` by handing them exactly enough experience."""
    player = make_player(0, 0)
    while player.level < level:
        player.gain_xp(player.xp_to_next_level)
    return player


# -- the experience curve --------------------------------------------------


def test_each_level_costs_more_than_the_last():
    costs = [xp_for_level(level) for level in range(1, 8)]
    assert costs == sorted(costs)
    assert len(set(costs)) == len(costs)


def test_a_tougher_monster_is_worth_more():
    rat = next(t for t in MONSTER_TEMPLATES if t.name == "Rat").spawn(0, 0, 1)
    ogre = next(t for t in MONSTER_TEMPLATES if t.name == "Ogre").spawn(0, 0, 4)
    assert xp_value(ogre) > xp_value(rat)


def test_the_same_species_is_worth_more_deeper_down():
    orc = next(t for t in MONSTER_TEMPLATES if t.name == "Orc")
    assert xp_value(orc.spawn(0, 0, 8)) > xp_value(orc.spawn(0, 0, 2))


# -- levelling up ----------------------------------------------------------


def test_a_new_character_starts_at_level_one():
    player = make_player(0, 0)
    assert player.level == 1 and player.xp == 0
    assert player.xp_to_next_level == xp_for_level(1)


def test_experience_short_of_a_level_just_accumulates():
    player = make_player(0, 0)
    assert player.gain_xp(xp_for_level(1) - 1) == 0
    assert player.level == 1
    assert player.xp_to_next_level == 1


def test_enough_experience_buys_a_level():
    player = make_player(0, 0)
    assert player.gain_xp(xp_for_level(1)) == 1
    assert player.level == 2 and player.xp == 0


def test_leftover_experience_carries_into_the_next_level():
    player = make_player(0, 0)
    player.gain_xp(xp_for_level(1) + 7)
    assert player.level == 2 and player.xp == 7


def test_one_huge_award_can_buy_several_levels():
    player = make_player(0, 0)
    total = xp_for_level(1) + xp_for_level(2) + xp_for_level(3)
    assert player.gain_xp(total) == 3
    assert player.level == 4 and player.xp == 0


def test_nothing_is_gained_from_nothing():
    player = make_player(0, 0)
    assert player.gain_xp(0) == 0
    assert player.gain_xp(-50) == 0
    assert player.level == 1 and player.xp == 0


# -- what a level is worth -------------------------------------------------


def test_a_level_raises_the_ceiling_and_heals():
    player = make_player(0, 0)
    player.take_damage(10)
    hurt, ceiling = player.hp, player.max_hp

    player.gain_xp(xp_for_level(1))
    assert player.max_hp == ceiling + HP_PER_LEVEL
    assert player.hp == hurt + HP_PER_LEVEL, "levelling should heal, not just promise"


def test_health_gained_by_levelling_never_exceeds_the_new_maximum():
    player = levelled(6)
    assert player.hp <= player.max_hp


def test_attack_and_defense_come_on_schedule():
    base = make_player(0, 0)
    for level in range(2, 8):
        player = levelled(level)
        assert player.base_attack == base.base_attack + level // LEVELS_PER_ATTACK
        assert player.defense == base.defense + level // LEVELS_PER_DEFENSE


def test_levelling_keeps_the_weapon_bonus():
    player = make_player(0, 0)
    dagger = ITEMS["Dagger"].spawn()
    player.equip(dagger)
    armed = player.attack

    player.gain_xp(xp_for_level(1))  # level 2 grants a point of attack
    assert player.attack == armed + 1
    assert player.attack == player.base_attack + dagger.power


# -- earning it in play ----------------------------------------------------


def test_killing_something_earns_its_experience():
    game = build(["#####", "#@r.#", "#####"])
    rat = game.entities[0]
    worth = xp_value(rat)

    while rat in game.entities and game.turns < 10:
        game.move_player(1, 0)
    assert game.xp_earned == worth
    assert game.player.xp == worth


def test_a_kill_at_range_earns_experience_too():
    game = build(["##########", "#@..ggg..#", "##########"])
    game.inventory.add(ITEMS["Flask of Fire"].spawn())
    game.use_item(0, target=(5, 1))
    assert game.kills == 3
    assert game.xp_earned > 0
    assert game.player.xp + sum(
        xp_for_level(level) for level in range(1, game.player.level)
    ) == game.xp_earned


def test_reaching_a_level_is_announced():
    game = build(["############", "#@gggggggg.#", "############"])
    while game.entities and game.turns < 200:
        game.move_player(1, 0)
    assert game.player.level > 1, "eight goblins should be worth a level"
    assert any("reach level" in message.text for message in game.messages)


def test_the_run_report_includes_the_level_reached():
    game = build(["#####", "#@r.#", "#####"])
    game.move_player(1, 0)
    summary = dict(game.run_summary())
    assert summary["Character level"] == str(game.player.level)
    assert summary["Experience"] == str(game.xp_earned)


def test_levels_and_experience_survive_a_save(tmp_path):
    from roguelike.persistence import load_game, save_game

    game = GameState.new_game(seed=1234)
    game.player.gain_xp(xp_for_level(1) + xp_for_level(2) + 5)
    game.xp_earned = 999

    path = tmp_path / "save.json"
    save_game(game, path)
    restored = load_game(path)

    assert restored.player.level == game.player.level == 3
    assert restored.player.xp == game.player.xp
    assert restored.player.max_hp == game.player.max_hp
    assert restored.player.base_attack == game.player.base_attack
    assert restored.player.defense == game.player.defense
    assert restored.xp_earned == 999


# -- the difficulty curve --------------------------------------------------

#: Weapon bonus a player can reasonably be carrying on each floor.
WEAPON_BY_FLOOR = {1: 2, 2: 4, 3: 7, 4: 7, 5: 10, 6: 10, 7: 10, 8: 10, 9: 10, 10: 10}


def worst_fight_cost(floor: int) -> float:
    """Fraction of maximum health the nastiest thing on ``floor`` would cost.

    Models a player who has levelled roughly in step with the depth and found
    the weapon tier of the moment.
    """
    player = levelled(floor)
    attack = player.base_attack + WEAPON_BY_FLOOR[floor]
    worst = 0.0
    for template in templates_for_floor(floor):
        monster = template.spawn(0, 0, floor)
        hits = math.ceil(monster.hp / max(1, attack - monster.defense))
        swings = hits / 2 if monster.behaviour is Behaviour.SLOW else hits
        worst = max(worst, swings * max(0, monster.attack - player.defense))
    return worst / player.max_hp


@pytest.mark.parametrize("floor", range(2, 11))
def test_the_dungeon_keeps_pace_with_the_player(floor: int):
    """Levelling must not outrun the dungeon and make descending easier."""
    cost = worst_fight_cost(floor)
    assert 0.12 <= cost <= 0.40, (
        f"floor {floor}: the worst fight costs {cost:.0%} of maximum health"
    )


def test_descending_never_becomes_a_relief():
    """The floor you arrive on should not be safer than the one you left."""
    costs = [worst_fight_cost(floor) for floor in range(2, 11)]
    assert costs[-1] >= costs[0] * 0.8, (
        f"danger fades with depth: {[f'{c:.0%}' for c in costs]}"
    )


def test_no_monster_one_shots_a_levelled_player():
    for floor in range(1, 11):
        player = levelled(floor)
        for template in templates_for_floor(floor):
            monster = template.spawn(0, 0, floor)
            damage = max(0, monster.attack - player.defense)
            assert damage < player.max_hp, (
                f"a floor-{floor} {monster.name} one-shots a level-{floor} player"
            )
