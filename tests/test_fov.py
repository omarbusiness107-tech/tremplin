"""Shadowcasting field of view, Bresenham lines, and line of sight."""

from __future__ import annotations

import pytest

from roguelike.fov import bresenham, compute_fov, line_of_sight

# A two-room map joined by a one-tile gap at (4, 3).
ROOMS = [
    "###########",
    "#.........#",
    "#.........#",
    "####.######",
    "#.........#",
    "#.........#",
    "###########",
]


def blocker(rows: list[str]):
    """A blocks_sight predicate over an ASCII map; off-map counts as solid."""

    def blocks(x: int, y: int) -> bool:
        if not (0 <= y < len(rows) and 0 <= x < len(rows[y])):
            return True
        return rows[y][x] == "#"

    return blocks


def test_origin_is_always_visible_even_when_it_blocks_sight():
    """Standing in a doorway, you still see the doorway and the walls beside it."""
    rows = ["#####", "#####", "#####", "#####", "#####"]
    visible = compute_fov(blocker(rows), (2, 2), 5)
    assert (2, 2) in visible
    # The surrounding walls are lit, but they shadow everything behind them.
    assert visible <= {(x, y) for x in range(1, 4) for y in range(1, 4)}


def test_zero_radius_sees_only_the_origin():
    assert compute_fov(blocker(ROOMS), (5, 1), 0) == {(5, 1)}


def test_open_room_is_fully_visible_including_its_walls():
    visible = compute_fov(blocker(ROOMS), (5, 1), 12)
    for y in (1, 2):
        for x in range(1, 10):
            assert (x, y) in visible, f"floor {(x, y)} should be lit"
    assert (0, 1) in visible and (10, 1) in visible  # side walls
    assert (5, 0) in visible  # far wall


def test_walls_hide_what_is_behind_them():
    visible = compute_fov(blocker(ROOMS), (5, 1), 12)
    # The bottom room is only reachable by sight through the gap at (4, 3);
    # tiles far to the right of it stay dark.
    assert (9, 5) not in visible
    assert (9, 4) not in visible


def test_light_passes_through_a_gap():
    visible = compute_fov(blocker(ROOMS), (5, 1), 12)
    assert (4, 3) in visible  # the gap itself
    assert (4, 4) in visible  # and the tile just beyond it


def test_visible_tiles_stay_within_the_radius():
    radius = 4
    origin = (5, 2)
    open_map = ["." * 20 for _ in range(20)]
    for x, y in compute_fov(blocker(open_map), origin, radius):
        dx, dy = x - origin[0], y - origin[1]
        assert dx * dx + dy * dy < radius * radius or (x, y) == origin


def test_a_pillar_casts_a_shadow():
    rows = [
        "..........",
        "..........",
        "....#.....",
        "..........",
        "..........",
    ]
    visible = compute_fov(blocker(rows), (4, 0), 9)
    assert (4, 2) in visible  # the pillar itself is seen
    assert (4, 3) not in visible  # directly behind it is not
    assert (4, 4) not in visible


def test_fov_is_deterministic():
    walls = blocker(ROOMS)
    assert compute_fov(walls, (5, 1), 8) == compute_fov(walls, (5, 1), 8)


@pytest.mark.parametrize(
    "start, end",
    [((0, 0), (5, 0)), ((0, 0), (0, 5)), ((0, 0), (4, 4)), ((3, 7), (1, 2))],
)
def test_bresenham_runs_between_both_endpoints(start, end):
    points = bresenham(start, end)
    assert points[0] == start and points[-1] == end
    # Each step moves at most one tile on each axis.
    for (x1, y1), (x2, y2) in zip(points, points[1:]):
        assert abs(x2 - x1) <= 1 and abs(y2 - y1) <= 1


def test_bresenham_of_a_single_point():
    assert bresenham((2, 2), (2, 2)) == [(2, 2)]


def test_line_of_sight_is_clear_down_an_open_row():
    assert line_of_sight(blocker(ROOMS), (1, 1), (9, 1), 20)


def test_line_of_sight_is_blocked_by_a_wall():
    assert not line_of_sight(blocker(ROOMS), (2, 1), (2, 5), 20)


def test_line_of_sight_through_the_gap_is_clear():
    assert line_of_sight(blocker(ROOMS), (4, 1), (4, 5), 20)


def test_line_of_sight_fails_beyond_the_radius():
    walls = blocker(["." * 30 for _ in range(3)])
    assert line_of_sight(walls, (0, 0), (5, 0), 8)
    assert not line_of_sight(walls, (0, 0), (20, 0), 8)


def test_endpoints_do_not_block_their_own_line_of_sight():
    """A monster standing in a doorway can still see out of it."""
    rows = ["...", ".#.", "..."]
    # Both endpoints are walls, but nothing lies between them.
    assert line_of_sight(blocker(rows), (1, 1), (1, 0), 5)
