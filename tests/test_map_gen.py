"""Dungeon generation: determinism, structure, and connectivity."""

from __future__ import annotations

from random import Random

import pytest

from roguelike.map_gen import (
    WALKABLE_TILES,
    WALL,
    Rect,
    generate_dungeon,
)

SEEDS = list(range(50))


def build(seed: int, width: int = 80, height: int = 45):
    return generate_dungeon(width, height, Random(seed))


def reachable_tiles(tile_map, start: tuple[int, int]) -> set[tuple[int, int]]:
    """Flood fill of walkable tiles from ``start``, four-way."""
    seen = {start}
    frontier = [start]
    while frontier:
        x, y = frontier.pop()
        for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
            neighbour = (x + dx, y + dy)
            if neighbour in seen or not tile_map.is_walkable(*neighbour):
                continue
            seen.add(neighbour)
            frontier.append(neighbour)
    return seen


def test_same_seed_gives_identical_dungeon():
    assert build(99).rows() == build(99).rows()


def test_different_seeds_give_different_dungeons():
    assert build(1).rows() != build(2).rows()


@pytest.mark.parametrize("seed", SEEDS)
def test_dungeon_has_rooms_and_walkable_space(seed: int):
    tile_map = build(seed)
    assert tile_map.rooms, "generator produced no rooms"
    walkable = sum(
        1
        for row in tile_map.grid
        for tile in row
        if tile in WALKABLE_TILES
    )
    assert walkable > 100


@pytest.mark.parametrize("seed", SEEDS)
def test_map_border_is_solid_wall(seed: int):
    tile_map = build(seed)
    top, bottom = tile_map.grid[0], tile_map.grid[-1]
    assert set(top) == {WALL}
    assert set(bottom) == {WALL}
    for row in tile_map.grid:
        assert row[0] == WALL and row[-1] == WALL


@pytest.mark.parametrize("seed", SEEDS)
def test_rooms_never_overlap(seed: int):
    tile_map = build(seed)
    claimed: set[tuple[int, int]] = set()
    for room in tile_map.rooms:
        tiles = {
            (x, y)
            for y in range(room.y, room.y2)
            for x in range(room.x, room.x2)
        }
        assert not (tiles & claimed), "two rooms share tiles"
        claimed |= tiles


@pytest.mark.parametrize("seed", SEEDS)
def test_every_walkable_tile_is_reachable(seed: int):
    """No room or corridor may be walled off from the player's start."""
    tile_map = build(seed)
    all_walkable = {
        (x, y)
        for y in range(tile_map.height)
        for x in range(tile_map.width)
        if tile_map.is_walkable(x, y)
    }
    start = tile_map.rooms[0].center
    assert reachable_tiles(tile_map, start) == all_walkable


def test_out_of_bounds_reads_as_wall():
    tile_map = build(3)
    assert tile_map.get(-1, 0) == WALL
    assert tile_map.get(0, -1) == WALL
    assert tile_map.get(tile_map.width, 0) == WALL
    assert not tile_map.is_walkable(-5, -5)


def test_tiny_map_still_yields_a_room():
    tile_map = generate_dungeon(10, 8, Random(0))
    assert tile_map.rooms
    assert tile_map.is_walkable(*tile_map.rooms[0].center)


def test_rect_geometry():
    rect = Rect(2, 3, 4, 6)
    assert (rect.x2, rect.y2) == (6, 9)
    assert rect.center == (4, 6)
    assert rect.contains(2, 3) and rect.contains(5, 8)
    assert not rect.contains(6, 3) and not rect.contains(1, 3)
