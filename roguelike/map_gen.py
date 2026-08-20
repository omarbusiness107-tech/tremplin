"""Procedural dungeon generation using binary space partitioning (BSP).

The generator is fully deterministic: every random choice is drawn from the
``random.Random`` instance handed in by the caller, so the same seed always
produces the same dungeon.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from random import Random

# Tile glyphs. These double as the characters drawn on screen.
WALL = "#"
FLOOR = "."
DOOR = "+"
STAIRS_DOWN = ">"

WALKABLE_TILES = frozenset({FLOOR, DOOR, STAIRS_DOWN})

# Tuning knobs for the BSP pass.
MIN_LEAF_SIZE = 8  # a partition smaller than this is never split again
MIN_ROOM_SIZE = 4  # smallest room interior, in tiles
MAX_SPLIT_DEPTH = 5


@dataclass(frozen=True)
class Rect:
    """An axis-aligned rectangle covering ``w`` x ``h`` tiles from (x, y)."""

    x: int
    y: int
    w: int
    h: int

    @property
    def x2(self) -> int:
        """One past the right-most column."""
        return self.x + self.w

    @property
    def y2(self) -> int:
        """One past the bottom-most row."""
        return self.y + self.h

    @property
    def center(self) -> tuple[int, int]:
        return self.x + self.w // 2, self.y + self.h // 2

    def contains(self, x: int, y: int) -> bool:
        return self.x <= x < self.x2 and self.y <= y < self.y2


@dataclass
class TileMap:
    """A dungeon floor stored as a grid of tile glyphs."""

    width: int
    height: int
    grid: list[list[str]]
    rooms: list[Rect] = field(default_factory=list)

    @classmethod
    def filled(cls, width: int, height: int, tile: str = WALL) -> TileMap:
        grid = [[tile for _ in range(width)] for _ in range(height)]
        return cls(width=width, height=height, grid=grid)

    def in_bounds(self, x: int, y: int) -> bool:
        return 0 <= x < self.width and 0 <= y < self.height

    def get(self, x: int, y: int) -> str:
        """Tile at (x, y); out-of-bounds reads as solid wall."""
        if not self.in_bounds(x, y):
            return WALL
        return self.grid[y][x]

    def set(self, x: int, y: int, tile: str) -> None:
        if self.in_bounds(x, y):
            self.grid[y][x] = tile

    def is_walkable(self, x: int, y: int) -> bool:
        return self.get(x, y) in WALKABLE_TILES

    def rows(self) -> list[str]:
        """The whole map as one string per row (handy for tests and debugging)."""
        return ["".join(row) for row in self.grid]


class _BSPNode:
    """One partition of the dungeon rectangle, split into two children or a leaf."""

    def __init__(self, rect: Rect) -> None:
        self.rect = rect
        self.left: _BSPNode | None = None
        self.right: _BSPNode | None = None
        self.room: Rect | None = None

    @property
    def is_leaf(self) -> bool:
        return self.left is None and self.right is None

    def leaves(self) -> list[_BSPNode]:
        if self.is_leaf:
            return [self]
        leaves: list[_BSPNode] = []
        for child in (self.left, self.right):
            if child is not None:
                leaves.extend(child.leaves())
        return leaves

    def pick_room(self, rng: Random) -> Rect | None:
        """A random room from anywhere in this subtree."""
        rooms = [leaf.room for leaf in self.leaves() if leaf.room is not None]
        if not rooms:
            return None
        return rng.choice(rooms)


def _split(node: _BSPNode, rng: Random, depth: int) -> None:
    """Recursively cut ``node`` in two until the partitions are small enough."""
    if depth >= MAX_SPLIT_DEPTH:
        return

    rect = node.rect
    can_split_h = rect.h >= MIN_LEAF_SIZE * 2  # a horizontal cut needs vertical room
    can_split_v = rect.w >= MIN_LEAF_SIZE * 2
    if not can_split_h and not can_split_v:
        return

    if can_split_h and can_split_v:
        # Cut against the long axis so partitions stay roughly square.
        if rect.w > rect.h * 1.25:
            horizontal = False
        elif rect.h > rect.w * 1.25:
            horizontal = True
        else:
            horizontal = rng.random() < 0.5
    else:
        horizontal = can_split_h

    if horizontal:
        cut = rng.randint(MIN_LEAF_SIZE, rect.h - MIN_LEAF_SIZE)
        node.left = _BSPNode(Rect(rect.x, rect.y, rect.w, cut))
        node.right = _BSPNode(Rect(rect.x, rect.y + cut, rect.w, rect.h - cut))
    else:
        cut = rng.randint(MIN_LEAF_SIZE, rect.w - MIN_LEAF_SIZE)
        node.left = _BSPNode(Rect(rect.x, rect.y, cut, rect.h))
        node.right = _BSPNode(Rect(rect.x + cut, rect.y, rect.w - cut, rect.h))

    _split(node.left, rng, depth + 1)
    _split(node.right, rng, depth + 1)


def _carve_room(leaf: _BSPNode, rng: Random, tile_map: TileMap) -> None:
    """Place a random room inside ``leaf``, leaving a one-tile wall margin."""
    rect = leaf.rect
    # The margin keeps neighbouring rooms from sharing a wall face.
    max_w = rect.w - 2
    max_h = rect.h - 2
    if max_w < MIN_ROOM_SIZE or max_h < MIN_ROOM_SIZE:
        return

    w = rng.randint(MIN_ROOM_SIZE, max_w)
    h = rng.randint(MIN_ROOM_SIZE, max_h)
    x = rng.randint(rect.x + 1, rect.x2 - w - 1)
    y = rng.randint(rect.y + 1, rect.y2 - h - 1)
    room = Rect(x, y, w, h)

    for ry in range(room.y, room.y2):
        for rx in range(room.x, room.x2):
            tile_map.set(rx, ry, FLOOR)

    leaf.room = room
    tile_map.rooms.append(room)


def _carve_h_corridor(tile_map: TileMap, x1: int, x2: int, y: int) -> None:
    for x in range(min(x1, x2), max(x1, x2) + 1):
        if tile_map.get(x, y) == WALL:
            tile_map.set(x, y, FLOOR)


def _carve_v_corridor(tile_map: TileMap, y1: int, y2: int, x: int) -> None:
    for y in range(min(y1, y2), max(y1, y2) + 1):
        if tile_map.get(x, y) == WALL:
            tile_map.set(x, y, FLOOR)


def _connect(node: _BSPNode, rng: Random, tile_map: TileMap) -> None:
    """Join every pair of sibling partitions with an L-shaped corridor."""
    if node.is_leaf or node.left is None or node.right is None:
        return

    _connect(node.left, rng, tile_map)
    _connect(node.right, rng, tile_map)

    left_room = node.left.pick_room(rng)
    right_room = node.right.pick_room(rng)
    if left_room is None or right_room is None:
        return

    x1, y1 = left_room.center
    x2, y2 = right_room.center
    if rng.random() < 0.5:
        _carve_h_corridor(tile_map, x1, x2, y1)
        _carve_v_corridor(tile_map, y1, y2, x2)
    else:
        _carve_v_corridor(tile_map, y1, y2, x1)
        _carve_h_corridor(tile_map, x1, x2, y2)


def _place_doors(tile_map: TileMap) -> None:
    """Turn each corridor mouth in a room's wall ring into a door tile.

    A ring tile only counts as a mouth when the tile straight out from it is
    also walkable — that is what tells a corridor punching *through* the wall
    apart from one merely running alongside it.
    """
    for room in tile_map.rooms:
        # Each face of the ring, paired with the outward direction across it.
        faces: list[tuple[list[tuple[int, int]], tuple[int, int]]] = [
            ([(x, room.y - 1) for x in range(room.x, room.x2)], (0, -1)),
            ([(x, room.y2) for x in range(room.x, room.x2)], (0, 1)),
            ([(room.x - 1, y) for y in range(room.y, room.y2)], (-1, 0)),
            ([(room.x2, y) for y in range(room.y, room.y2)], (1, 0)),
        ]
        for tiles, (out_x, out_y) in faces:
            for x, y in tiles:
                if tile_map.get(x, y) != FLOOR:
                    continue
                if tile_map.is_walkable(x + out_x, y + out_y):
                    tile_map.set(x, y, DOOR)


def generate_dungeon(width: int, height: int, rng: Random) -> TileMap:
    """Build one dungeon floor of ``width`` x ``height`` tiles.

    Rooms are carved into BSP leaves and joined by corridors, so the whole
    floor is guaranteed to be one connected component.
    """
    tile_map = TileMap.filled(width, height, WALL)
    root = _BSPNode(Rect(0, 0, width, height))
    _split(root, rng, depth=0)

    for leaf in root.leaves():
        _carve_room(leaf, rng, tile_map)

    if not tile_map.rooms:
        # Degenerate map (tiny dimensions): fall back to one central room so
        # the caller always gets somewhere to stand.
        room = Rect(1, 1, max(1, width - 2), max(1, height - 2))
        for ry in range(room.y, room.y2):
            for rx in range(room.x, room.x2):
                tile_map.set(rx, ry, FLOOR)
        tile_map.rooms.append(room)
        return tile_map

    _connect(root, rng, tile_map)
    _place_doors(tile_map)
    return tile_map
