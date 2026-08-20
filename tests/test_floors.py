"""Stairs, descending, and how the dungeon gets harder as you go down."""

from __future__ import annotations

import pytest
from helpers import build

from roguelike.entities import templates_for_floor
from roguelike.game import GameState
from roguelike.inventory import ITEM_TEMPLATES
from roguelike.map_gen import STAIRS_DOWN

TEMPLATES = {template.name: template for template in ITEM_TEMPLATES}


def go_down(game: GameState) -> bool:
    """Walk onto the stairs and take them."""
    game.player.move_to(*game.stairs)
    return game.descend()


# -- where the stairs are --------------------------------------------------


@pytest.mark.parametrize("seed", range(20))
def test_every_floor_has_reachable_stairs(seed: int):
    game = GameState.new_game(seed=seed)
    assert game.stairs is not None
    assert game.tile_map.get(*game.stairs) == STAIRS_DOWN
    assert game.tile_map.is_walkable(*game.stairs)


@pytest.mark.parametrize("seed", range(20))
def test_the_stairs_are_not_in_the_room_you_arrive_in(seed: int):
    """Otherwise a floor could be skipped in a single step."""
    game = GameState.new_game(seed=seed)
    assert not game.tile_map.rooms[0].contains(*game.stairs)


def test_standing_on_the_stairs_is_detected():
    game = GameState.new_game(seed=7)
    assert game.on_stairs() is False
    game.player.move_to(*game.stairs)
    assert game.on_stairs() is True


# -- taking them -----------------------------------------------------------


def test_descending_anywhere_else_does_nothing():
    game = GameState.new_game(seed=7)
    assert game.descend() is False
    assert game.floor == 1
    assert game.turns == 0
    assert any("no stairs here" in message.text for message in game.messages)


def test_descending_builds_a_new_floor():
    game = GameState.new_game(seed=7)
    before = game.tile_map.rows()

    assert go_down(game) is True
    assert game.floor == 2
    assert game.tile_map.rows() != before
    assert game.stairs is not None


def test_a_new_floor_starts_unexplored():
    """Memory of the floor above must not leak onto the new one."""
    game = GameState.new_game(seed=7)
    for _ in range(8):
        game.move_player_in_direction("right")
    explored_above = set(game.explored)
    assert len(explored_above) > len(game.visible), "nothing was explored above"

    go_down(game)
    # Only what is lit right now is remembered — the map below is fresh.
    assert game.explored == game.visible
    assert len(game.explored) < game.tile_map.width * game.tile_map.height
    assert game.player.position == game.tile_map.rooms[0].center


def test_the_player_carries_everything_down_with_them():
    game = GameState.new_game(seed=7)
    game.inventory.add(TEMPLATES["Dagger"].spawn())
    game.inventory.add(TEMPLATES["Healing Potion"].spawn())
    game.use_item(0)  # wield the dagger
    game.player.hp = 12

    attack, pack, kills = game.player.attack, len(game.inventory), game.kills
    go_down(game)

    assert game.player.attack == attack
    assert game.player.weapon.name == "Dagger"
    assert len(game.inventory) == pack
    assert game.kills == kills
    assert game.player.hp >= 12, "descending should never cost health"


def test_descending_lets_the_player_catch_their_breath():
    game = GameState.new_game(seed=7)
    game.player.hp = 10
    go_down(game)
    assert game.player.hp > 10
    assert game.player.hp <= game.player.max_hp
    assert any("recover" in message.text for message in game.messages)


def test_descending_spends_a_turn_without_giving_monsters_a_free_hit():
    game = GameState.new_game(seed=7)
    game.player.hp = game.player.max_hp
    turns = game.turns
    go_down(game)
    assert game.turns == turns + 1
    assert game.player.hp == game.player.max_hp


def test_a_dead_player_cannot_descend():
    game = build(["#####", "#@..#", "#####"])
    game.stairs = game.player.position
    game.game_over = True
    assert game.descend() is False
    assert game.floor == 1


# -- the difficulty curve --------------------------------------------------


def test_going_deeper_brings_more_monsters_and_more_loot():
    game = GameState.new_game(seed=1234)
    first = (len(game.entities), len(game.items))
    for _ in range(4):
        go_down(game)
    assert game.floor == 5
    assert len(game.entities) > first[0], "the deeper floor was no busier"
    assert len(game.items) >= first[1], "the deeper floor was no richer"


def test_weak_species_stop_appearing_and_strong_ones_start():
    shallow = {template.name for template in templates_for_floor(1)}
    deep = {template.name for template in templates_for_floor(7)}
    assert "Rat" in shallow and "Rat" not in deep
    assert "Wraith" not in shallow and "Wraith" in deep


def test_the_same_species_is_tougher_further_down():
    shallow = templates_for_floor(2)[-1]  # the Orc, newly arrived
    deep_orc = shallow.spawn(0, 0, floor=8)
    fresh_orc = shallow.spawn(0, 0, floor=2)
    assert deep_orc.max_hp > fresh_orc.max_hp
    assert deep_orc.attack >= fresh_orc.attack


def test_no_monster_can_kill_a_healthy_player_in_a_single_blow():
    """A run should end from a losing fight, not from one unlucky step."""
    from roguelike.entities import make_player

    player = make_player(0, 0)
    for floor in range(1, 11):
        for template in templates_for_floor(floor):
            monster = template.spawn(0, 0, floor=floor)
            damage = max(0, monster.attack - player.defense)
            assert damage < player.max_hp, (
                f"a floor-{floor} {monster.name} one-shots a full-health player"
            )


# -- determinism across floors --------------------------------------------


def test_a_multi_floor_descent_replays_identically():
    def play() -> tuple:
        game = GameState.new_game(seed=4242)
        snapshots = []
        for _ in range(4):
            go_down(game)
            snapshots.append(
                (
                    game.floor,
                    game.tile_map.rows(),
                    game.stairs,
                    sorted((m.position, m.name, m.hp) for m in game.entities),
                    sorted((p, i.name) for p, i in game.items.items()),
                    game.player.hp,
                )
            )
        return tuple(snapshots)

    assert play() == play()
