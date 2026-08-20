"""Field of view and line of sight.

Visibility is computed with recursive shadowcasting over the eight octants:
each octant is scanned row by row, and every wall narrows the arc of slopes
that the rows behind it can still see through. The algorithm is exact and has
no randomness, so what the player can see is a pure function of the map and
their position.

The only input is a ``blocks_sight(x, y)`` predicate, which keeps this module
independent of how the map itself is stored.
"""

from __future__ import annotations

from typing import Callable

BlocksSight = Callable[[int, int], bool]

# The eight octant transforms, as columns: (xx, xy, yx, yy).
_OCTANTS: tuple[tuple[int, int, int, int], ...] = (
    (1, 0, 0, 1),
    (0, 1, 1, 0),
    (0, -1, 1, 0),
    (-1, 0, 0, 1),
    (-1, 0, 0, -1),
    (0, -1, -1, 0),
    (0, 1, -1, 0),
    (1, 0, 0, -1),
)


def _cast_light(
    visible: set[tuple[int, int]],
    blocks_sight: BlocksSight,
    origin_x: int,
    origin_y: int,
    row: int,
    start_slope: float,
    end_slope: float,
    radius: int,
    xx: int,
    xy: int,
    yx: int,
    yy: int,
) -> None:
    """Scan one octant from ``row`` outwards between two slopes."""
    if start_slope < end_slope:
        return

    radius_squared = radius * radius
    for distance in range(row, radius + 1):
        dx, dy = -distance - 1, -distance
        blocked = False
        new_start = start_slope

        while dx <= 0:
            dx += 1
            # Map the octant-local offset onto real map coordinates.
            map_x = origin_x + dx * xx + dy * xy
            map_y = origin_y + dx * yx + dy * yy
            # Slopes of this cell's left and right edges.
            left_slope = (dx - 0.5) / (dy + 0.5)
            right_slope = (dx + 0.5) / (dy - 0.5)

            if start_slope < right_slope:
                continue  # not reached by the beam yet
            if end_slope > left_slope:
                break  # past the far edge of the beam

            if dx * dx + dy * dy < radius_squared:
                visible.add((map_x, map_y))

            if blocked:
                # Walking along a run of walls: track where it ends.
                if blocks_sight(map_x, map_y):
                    new_start = right_slope
                else:
                    blocked = False
                    start_slope = new_start
            elif blocks_sight(map_x, map_y) and distance < radius:
                # A wall starts here: recurse for the arc to its left, then
                # carry on scanning this row with a narrowed arc.
                blocked = True
                _cast_light(
                    visible,
                    blocks_sight,
                    origin_x,
                    origin_y,
                    distance + 1,
                    start_slope,
                    left_slope,
                    radius,
                    xx,
                    xy,
                    yx,
                    yy,
                )
                new_start = right_slope

        if blocked:
            break  # the whole row ended behind a wall


def compute_fov(
    blocks_sight: BlocksSight,
    origin: tuple[int, int],
    radius: int,
) -> set[tuple[int, int]]:
    """Every tile visible from ``origin`` within ``radius``.

    Walls that stop the beam are themselves visible, so rooms are seen with
    their walls rather than as floating patches of floor. The origin is always
    included, even when the tile itself blocks sight (a doorway, say).
    """
    origin_x, origin_y = origin
    visible = {origin}
    if radius <= 0:
        return visible

    for xx, xy, yx, yy in _OCTANTS:
        _cast_light(
            visible,
            blocks_sight,
            origin_x,
            origin_y,
            1,
            1.0,
            0.0,
            radius,
            xx,
            xy,
            yx,
            yy,
        )
    return visible


def bresenham(start: tuple[int, int], end: tuple[int, int]) -> list[tuple[int, int]]:
    """The tiles on the straight line from ``start`` to ``end``, both included."""
    x1, y1 = start
    x2, y2 = end
    dx, dy = abs(x2 - x1), abs(y2 - y1)
    step_x = 1 if x1 < x2 else -1
    step_y = 1 if y1 < y2 else -1
    error = dx - dy

    points: list[tuple[int, int]] = []
    x, y = x1, y1
    while True:
        points.append((x, y))
        if (x, y) == (x2, y2):
            return points
        doubled = error * 2
        if doubled > -dy:
            error -= dy
            x += step_x
        if doubled < dx:
            error += dx
            y += step_y


def line_of_sight(
    blocks_sight: BlocksSight,
    start: tuple[int, int],
    end: tuple[int, int],
    radius: int,
) -> bool:
    """True when ``end`` is within ``radius`` of ``start`` and nothing blocks it.

    Used for monster sight, where casting a whole FOV per monster would be
    wasteful. Only the tiles *between* the endpoints can block the view.
    """
    dx, dy = end[0] - start[0], end[1] - start[1]
    if dx * dx + dy * dy >= radius * radius:
        return False
    return not any(
        blocks_sight(x, y) for x, y in bresenham(start, end)[1:-1]
    )
