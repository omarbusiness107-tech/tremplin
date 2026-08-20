"""Game state: movement, collision, and camera framing."""

from __future__ import annotations

import pytest

from roguelike.game import GameState, camera_origin
from roguelike.map_gen import WALL


def new_game(seed: int = 42) -> GameState:
    return GameState.new_game(seed=seed)


def test_new_game_is_reproducible_from_its_seed():
    first, second = new_game(7), new_game(7)
    assert first.tile_map.rows() == second.tile_map.rows()
    assert first.player.position == second.player.position


def test_new_game_without_seed_records_the_seed_it_used():
    game = GameState.new_game()
    replay = GameState.new_game(seed=game.seed)
    assert replay.tile_map.rows() == game.tile_map.rows()


def test_player_starts_on_walkable_ground():
    game = new_game()
    assert game.tile_map.is_walkable(*game.player.position)
    assert game.floor == 1 and game.turns == 0


def test_moving_into_open_floor_spends_a_turn():
    game = new_game()
    # Find a direction that is definitely open from the starting room centre.
    for direction in ("right", "left", "up", "down"):
        start = game.player.position
        if game.move_player_in_direction(direction):
            assert game.player.position != start
            assert game.turns == 1
            return
    pytest.fail("player is boxed in at spawn")


def test_walls_block_movement_and_cost_no_turn():
    game = new_game()
    player = game.player
    # Drop a wall right of the player, then try to walk into it.
    game.tile_map.set(player.x + 1, player.y, WALL)
    assert game.move_player(1, 0) is False
    assert game.player.position == (player.x, player.y)
    assert game.turns == 0


def test_player_cannot_leave_the_map():
    game = new_game()
    game.player.move_to(0, 0)
    assert game.move_player(-1, 0) is False
    assert game.move_player(0, -1) is False


def test_movement_is_deterministic_for_a_fixed_seed():
    moves = ["right", "right", "down", "left", "up", "down", "down", "right"]
    runs = []
    for _ in range(2):
        game = new_game(2024)
        results = [game.move_player_in_direction(m) for m in moves]
        runs.append((results, game.player.position, game.turns))
    assert runs[0] == runs[1]


@pytest.mark.parametrize(
    "focus, expected",
    [
        ((0, 0), (0, 0)),            # clamped at the top-left corner
        ((40, 20), (30, 10)),        # centred mid-map
        ((79, 44), (60, 25)),        # clamped at the bottom-right corner
    ],
)
def test_camera_centres_and_clamps(focus, expected):
    assert camera_origin(*focus, 20, 20, 80, 45) == expected


def test_camera_pins_to_origin_when_view_is_larger_than_map():
    assert camera_origin(5, 5, 200, 200, 80, 45) == (0, 0)
