"""Saving a run to JSON and reading it back."""

from __future__ import annotations

import json

import pytest
from helpers import build

from roguelike.entities import MONSTER_TEMPLATES, Behaviour
from roguelike.game import GameState
from roguelike.inventory import ITEM_TEMPLATES
from roguelike.persistence import (
    SAVE_VERSION,
    SaveError,
    delete_save,
    game_from_dict,
    game_to_dict,
    has_save,
    load_game,
    save_game,
)

ITEMS = {template.name: template for template in ITEM_TEMPLATES}
MONSTERS = {template.name: template for template in MONSTER_TEMPLATES}


def played_game(seed: int = 1234) -> GameState:
    """A run with some history behind it: a floor cleared, loot, a kill."""
    game = GameState.new_game(seed=seed)
    game.inventory.add(ITEMS["Dagger"].spawn())
    game.inventory.add(ITEMS["Healing Potion"].spawn())
    game.inventory.add(ITEMS["Flask of Fire"].spawn())
    game.use_item(0)  # wield the dagger
    for direction in ["down"] * 5 + ["right"] * 6:
        game.move_player_in_direction(direction)
    game.player.move_to(*game.stairs)
    game.descend()
    game.kills, game.items_found = 6, 3
    return game


def round_trip(game: GameState) -> GameState:
    return game_from_dict(json.loads(json.dumps(game_to_dict(game))))


# -- the round trip --------------------------------------------------------


def test_a_saved_run_comes_back_identical():
    game = played_game()
    assert game_to_dict(round_trip(game)) == game_to_dict(game)


def test_the_map_survives_intact():
    game = played_game()
    restored = round_trip(game)
    assert restored.tile_map.rows() == game.tile_map.rows()
    assert restored.tile_map.rooms == game.tile_map.rooms
    assert restored.stairs == game.stairs


def test_the_score_survives():
    game = played_game()
    restored = round_trip(game)
    for field in ("seed", "floor", "turns", "kills", "items_found", "game_over"):
        assert getattr(restored, field) == getattr(game, field)


def test_gear_and_pack_survive():
    game = played_game()
    restored = round_trip(game)
    assert restored.player.weapon.name == "Dagger"
    assert restored.player.attack == game.player.attack
    assert restored.player.base_attack == game.player.base_attack
    assert [i.name for i in restored.inventory.items] == [
        i.name for i in game.inventory.items
    ]
    thrown = next(i for i in restored.inventory.items if i.needs_target)
    assert thrown.throw_range > 0 and thrown.blast_radius > 0


def test_loot_on_the_floor_survives():
    game = played_game()
    restored = round_trip(game)
    assert {position: carried.name for position, carried in restored.items.items()} == {
        position: carried.name for position, carried in game.items.items()
    }


def test_monsters_survive_with_their_state_of_mind():
    game = build(["##########", "#@......W#", "##########"], floor=6)
    game.wait()  # the wraith spots the player and remembers where
    wraith = game.entities[0]
    wraith.resting = True
    assert wraith.last_seen is not None

    restored = round_trip(game).entities[0]
    assert restored.behaviour is Behaviour.STALKER
    assert restored.last_seen == wraith.last_seen
    assert restored.resting is wraith.resting
    assert (restored.hp, restored.attack, restored.sight_radius) == (
        wraith.hp,
        wraith.attack,
        wraith.sight_radius,
    )


def test_the_message_log_survives():
    game = played_game()
    restored = round_trip(game)
    assert [m.text for m in restored.messages] == [m.text for m in game.messages]
    assert [m.color for m in restored.messages] == [m.color for m in game.messages]


def test_the_explored_map_survives_and_sight_is_recomputed():
    game = played_game()
    restored = round_trip(game)
    assert restored.explored == game.explored
    # Visible tiles are not stored; they are worked out again on load.
    assert "visible" not in game_to_dict(game)
    assert restored.visible == game.visible


# -- the random number generator ------------------------------------------


def test_the_generator_carries_on_rather_than_restarting():
    game = played_game()
    restored = round_trip(game)
    assert [game.rng.random() for _ in range(5)] == [
        restored.rng.random() for _ in range(5)
    ]


def test_a_resumed_run_unfolds_exactly_as_an_uninterrupted_one():
    """The whole point of saving the generator state."""
    moves = ["right", "down", "down", "left", "up", "right", "down", "left"] * 3

    straight_through = played_game()
    for move in moves:
        straight_through.move_player_in_direction(move)

    interrupted = played_game()
    for move in moves[:8]:
        interrupted.move_player_in_direction(move)
    interrupted = round_trip(interrupted)
    for move in moves[8:]:
        interrupted.move_player_in_direction(move)

    assert game_to_dict(interrupted) == game_to_dict(straight_through)


# -- files -----------------------------------------------------------------


def test_saving_then_loading_a_file(tmp_path):
    path = tmp_path / "save.json"
    game = played_game()

    assert not has_save(path)
    save_game(game, path)
    assert has_save(path)
    assert game_to_dict(load_game(path)) == game_to_dict(game)


def test_saving_leaves_no_temporary_file_behind(tmp_path):
    path = tmp_path / "save.json"
    save_game(played_game(), path)
    assert [entry.name for entry in tmp_path.iterdir()] == ["save.json"]


def test_saving_twice_replaces_the_first(tmp_path):
    path = tmp_path / "save.json"
    first = played_game(seed=1)
    save_game(first, path)
    second = played_game(seed=2)
    save_game(second, path)
    assert load_game(path).seed == second.seed


def test_deleting_a_save_is_safe_whether_or_not_it_exists(tmp_path):
    path = tmp_path / "save.json"
    delete_save(path)  # nothing there; must not raise
    save_game(played_game(), path)
    delete_save(path)
    assert not has_save(path)


def test_the_file_really_is_json(tmp_path):
    path = tmp_path / "save.json"
    save_game(played_game(), path)
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["version"] == SAVE_VERSION
    assert isinstance(data["tile_map"]["rows"], list)


# -- refusing bad files ----------------------------------------------------


def test_a_missing_file_is_reported_not_crashed(tmp_path):
    with pytest.raises(SaveError, match="no save file"):
        load_game(tmp_path / "nothing.json")


def test_a_file_that_is_not_json_is_reported(tmp_path):
    path = tmp_path / "save.json"
    path.write_text("this is not json", encoding="utf-8")
    with pytest.raises(SaveError, match="not readable JSON"):
        load_game(path)


def test_a_save_from_another_version_is_refused(tmp_path):
    path = tmp_path / "save.json"
    data = game_to_dict(played_game())
    data["version"] = SAVE_VERSION + 99
    path.write_text(json.dumps(data), encoding="utf-8")
    with pytest.raises(SaveError, match="version"):
        load_game(path)


def test_a_truncated_save_is_reported(tmp_path):
    path = tmp_path / "save.json"
    data = game_to_dict(played_game())
    del data["player"]
    path.write_text(json.dumps(data), encoding="utf-8")
    with pytest.raises(SaveError, match="malformed"):
        load_game(path)
