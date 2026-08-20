"""Fog of war, monster AI, and the turn loop, on hand-built maps.

Building the map from ASCII keeps these tests readable: `@` is the player,
letters are monsters, `#` walls, `.` floor, `+` doors.
"""

from __future__ import annotations

from random import Random

import pytest

from roguelike.entities import MONSTER_TEMPLATES, Monster, make_player
from roguelike.game import GameState
from roguelike.map_gen import FLOOR, TileMap

TEMPLATES = {template.char: template for template in MONSTER_TEMPLATES}


def build(rows: list[str], seed: int = 0) -> GameState:
    """A GameState laid out exactly as drawn."""
    grid = [list(row) for row in rows]
    tile_map = TileMap(width=len(grid[0]), height=len(grid), grid=grid)

    player = None
    monsters: list[Monster] = []
    for y, row in enumerate(grid):
        for x, char in enumerate(row):
            if char == "@":
                player = make_player(x, y)
                grid[y][x] = FLOOR
            elif char in TEMPLATES:
                monsters.append(TEMPLATES[char].spawn(x, y))
                grid[y][x] = FLOOR

    assert player is not None, "map has no @ for the player"
    game = GameState(
        seed=seed, rng=Random(seed), tile_map=tile_map, player=player,
        entities=list(monsters),
    )
    game.update_fov()
    return game


# A rat sees 6 tiles, so it starts within that range here.
CORRIDOR = [
    "########",
    "#@...r.#",
    "########",
]

# Long enough that the far end sits outside the player's 9-tile sight radius.
LONG_CORRIDOR = [
    "#" * 16,
    "#@" + "." * 12 + "r#",
    "#" * 16,
]


# -- fog of war ------------------------------------------------------------


def test_a_new_floor_starts_with_only_the_visible_tiles_explored():
    game = GameState.new_game(seed=1234)
    assert game.visible
    assert game.explored == game.visible


def test_exploring_never_forgets_a_tile():
    game = GameState.new_game(seed=1234)
    seen_so_far = set(game.explored)
    for direction in ["down"] * 6 + ["right"] * 6 + ["up"] * 6:
        game.move_player_in_direction(direction)
        assert seen_so_far <= game.explored, "a previously seen tile was forgotten"
        seen_so_far = set(game.explored)


def test_walking_away_leaves_tiles_explored_but_no_longer_visible():
    rows = [
        "#########",
        "#@..+..##",
        "#########",
    ]
    game = build(rows)
    far_corner = (6, 1)
    for _ in range(5):
        game.move_player_in_direction("right")
    assert far_corner in game.visible
    assert far_corner in game.explored

    for _ in range(5):
        game.move_player_in_direction("left")
    # The door was left behind: remembered, but out of sight.
    assert far_corner not in game.visible
    assert far_corner in game.explored


def test_unexplored_tiles_are_neither_visible_nor_remembered():
    game = GameState.new_game(seed=1234)
    total = game.tile_map.width * game.tile_map.height
    assert len(game.explored) < total, "the whole map was revealed at once"


def test_only_monsters_in_view_are_reported():
    game = build(CORRIDOR)
    rat = game.entities[0]
    assert rat.position in game.visible
    assert game.visible_monsters() == [rat]


def test_a_monster_beyond_the_lit_radius_is_not_reported():
    game = build(LONG_CORRIDOR)
    rat = game.entities[0]
    assert rat.position not in game.visible
    assert game.visible_monsters() == []


# -- bump-to-attack --------------------------------------------------------


def test_walking_into_a_monster_attacks_instead_of_moving():
    game = build(["#####", "#@r.#", "#####"])
    rat = game.entities[0]
    start = game.player.position

    assert game.move_player(1, 0) is True  # the turn was spent
    assert game.player.position == start, "the player stepped onto the monster"
    assert rat.hp < rat.max_hp
    assert game.turns == 1


def test_a_lethal_bump_removes_the_monster_and_counts_the_kill():
    game = build(["#####", "#@r.#", "#####"])
    rat = game.entities[0]
    rat.hp = 1

    game.move_player(1, 0)
    assert rat not in game.entities
    assert game.kills == 1
    assert any("dies" in message.text for message in game.messages)


def test_the_tile_frees_up_once_the_monster_is_dead():
    game = build(["#####", "#@r.#", "#####"])
    game.entities[0].hp = 1
    game.move_player(1, 0)  # kills it
    assert game.move_player(1, 0) is True
    assert game.player.position == (2, 1)


def test_attacking_is_logged():
    game = build(["#####", "#@r.#", "#####"])
    game.move_player(1, 0)
    assert any("You hit the Rat" in message.text for message in game.messages)


# -- monster AI ------------------------------------------------------------


def test_a_monster_closes_in_when_it_can_see_the_player():
    game = build(CORRIDOR)
    rat = game.entities[0]
    before = rat.x
    game.wait()
    assert rat.x < before, "the rat did not approach"


def test_a_monster_out_of_sight_range_stays_put():
    # A rat sees 6 tiles; this one is parked well beyond that.
    rows = ["#" * 22, "#@" + "." * 18 + "r#", "#" * 22]
    game = build(rows)
    rat = game.entities[0]
    start = rat.position
    for _ in range(3):
        game.wait()
    assert rat.position == start


def test_a_wall_hides_the_player_from_a_monster():
    rows = [
        "#######",
        "#@#..r#",
        "#######",
    ]
    game = build(rows)
    rat = game.entities[0]
    start = rat.position
    for _ in range(3):
        game.wait()
    assert rat.position == start, "the rat saw through a wall"


def test_a_monster_attacks_once_it_is_adjacent():
    game = build(["#####", "#@r.#", "#####"])
    full_hp = game.player.hp
    game.wait()
    assert game.player.hp < full_hp
    assert any("hits you" in message.text for message in game.messages)


def test_monsters_do_not_walk_through_walls_or_each_other():
    rows = [
        "##########",
        "#@..rr...#",
        "##########",
    ]
    game = build(rows)
    for _ in range(12):
        game.wait()
        positions = [monster.position for monster in game.entities]
        assert len(positions) == len(set(positions)), "two monsters share a tile"
        for monster in game.entities:
            assert game.tile_map.is_walkable(*monster.position)
            assert monster.position != game.player.position


def test_a_monster_steps_around_a_corner_toward_the_player():
    rows = [
        "######",
        "#@...#",
        "#.####",
        "#.####",
        "#r####",
        "######",
    ]
    game = build(rows)
    rat = game.entities[0]
    for _ in range(4):
        game.wait()
    assert rat.position != (1, 4), "the rat never moved"
    assert abs(rat.y - game.player.y) < 3


# -- death and the turn loop ----------------------------------------------


def test_the_player_dies_and_the_run_ends():
    game = build(["#####", "#@o.#", "#####"])
    game.player.hp = 5

    while not game.game_over and game.turns < 20:
        game.wait()

    assert game.game_over
    assert game.player.hp <= 0
    assert any("You die" in message.text for message in game.messages)


def test_a_dead_player_cannot_act():
    game = build(["#####", "#@o.#", "#####"])
    game.player.hp = 5
    while not game.game_over and game.turns < 20:
        game.wait()

    turns_at_death = game.turns
    assert game.move_player(1, 0) is False
    assert game.move_player_in_direction("left") is False
    assert game.wait() is False
    assert game.turns == turns_at_death


def test_monsters_stop_acting_the_moment_the_player_falls():
    rows = ["#######", "#@ooo.#", "#######"]
    game = build(rows)
    game.player.hp = 1
    game.wait()
    assert game.game_over
    # Only the first orc landed a blow; HP never goes below zero.
    assert game.player.hp == 0


def test_blocked_moves_cost_nothing():
    game = build(["###", "#@#", "###"])
    assert game.move_player(1, 0) is False
    assert game.turns == 0
    assert game.player.hp == game.player.max_hp  # monsters never got a turn


def test_waiting_spends_a_turn():
    game = build(["####", "#@.#", "####"])
    assert game.wait() is True
    assert game.turns == 1


# -- spawning --------------------------------------------------------------


@pytest.mark.parametrize("seed", range(20))
def test_monsters_spawn_on_open_ground_away_from_the_player(seed: int):
    game = GameState.new_game(seed=seed)
    assert game.entities, "no monsters were spawned"
    start_room = game.tile_map.rooms[0]
    occupied = set()
    for monster in game.entities:
        assert game.tile_map.is_walkable(*monster.position)
        assert monster.position != game.player.position
        assert not start_room.contains(*monster.position), "monster in the safe room"
        assert monster.position not in occupied, "two monsters spawned on one tile"
        occupied.add(monster.position)


def test_deeper_floors_carry_more_monsters():
    shallow = GameState.new_game(seed=5)
    deep = GameState.new_game(seed=5)
    deep.floor = 3
    deep.entities = deep._spawn_monsters()
    assert len(deep.entities) > len(shallow.entities)


def test_orcs_only_appear_below_the_first_floor():
    for seed in range(15):
        game = GameState.new_game(seed=seed)
        assert all(monster.name != "Orc" for monster in game.entities)


def test_a_whole_run_replays_identically_from_its_seed():
    moves = ["down", "right", "right", "down", "left", "up", "right", "down"] * 4

    def play() -> tuple:
        game = GameState.new_game(seed=31337)
        results = [game.move_player_in_direction(move) for move in moves]
        return (
            results,
            game.player.position,
            game.player.hp,
            game.turns,
            game.kills,
            sorted(monster.position for monster in game.entities),
            [message.text for message in game.messages],
        )

    assert play() == play()
