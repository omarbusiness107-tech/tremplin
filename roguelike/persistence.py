"""Saving a run to JSON and reading it back.

The whole of :class:`~roguelike.game.GameState` round-trips, including the
random number generator's internal state — so a restored run continues to
produce exactly the dungeon it would have produced had it never stopped.

Conversion is written out by hand rather than reflected off the dataclasses.
That is more code, but it means the on-disk format is something the game
declares rather than something it happens to have, and ``SAVE_VERSION`` can
guard it when the classes change.
"""

from __future__ import annotations

import json
from pathlib import Path
from random import Random

from .entities import Behaviour, Monster, Player
from .game import GameState, Message
from .inventory import Inventory, Item, ItemKind
from .map_gen import Rect, TileMap

#: Bumped whenever the layout below changes; older files are refused.
SAVE_VERSION = 2

#: Where a suspended run is kept, relative to the working directory.
DEFAULT_SAVE_PATH = Path("savegame.json")


class SaveError(Exception):
    """A save file could not be read, or was written by another version."""


# -- items -----------------------------------------------------------------


def item_to_dict(item: Item) -> dict:
    return {
        "name": item.name,
        "char": item.char,
        "color": item.color,
        "kind": item.kind.value,
        "power": item.power,
        "throw_range": item.throw_range,
        "blast_radius": item.blast_radius,
    }


def item_from_dict(data: dict) -> Item:
    return Item(
        name=data["name"],
        char=data["char"],
        color=data["color"],
        kind=ItemKind(data["kind"]),
        power=data["power"],
        throw_range=data["throw_range"],
        blast_radius=data["blast_radius"],
    )


# -- actors ----------------------------------------------------------------


def monster_to_dict(monster: Monster) -> dict:
    return {
        "x": monster.x,
        "y": monster.y,
        "char": monster.char,
        "name": monster.name,
        "color": monster.color,
        "hp": monster.hp,
        "max_hp": monster.max_hp,
        "attack": monster.attack,
        "defense": monster.defense,
        "sight_radius": monster.sight_radius,
        "behaviour": monster.behaviour.value,
        "last_seen": list(monster.last_seen) if monster.last_seen else None,
        "resting": monster.resting,
    }


def monster_from_dict(data: dict) -> Monster:
    last_seen = data["last_seen"]
    return Monster(
        x=data["x"],
        y=data["y"],
        char=data["char"],
        name=data["name"],
        color=data["color"],
        hp=data["hp"],
        max_hp=data["max_hp"],
        attack=data["attack"],
        defense=data["defense"],
        sight_radius=data["sight_radius"],
        behaviour=Behaviour(data["behaviour"]),
        last_seen=tuple(last_seen) if last_seen else None,
        resting=data["resting"],
    )


def player_to_dict(player: Player) -> dict:
    return {
        "x": player.x,
        "y": player.y,
        "hp": player.hp,
        "max_hp": player.max_hp,
        "attack": player.attack,
        "defense": player.defense,
        "base_attack": player.base_attack,
        "level": player.level,
        "xp": player.xp,
        "weapon": item_to_dict(player.weapon) if player.weapon else None,
    }


def player_from_dict(data: dict) -> Player:
    player = Player(
        x=data["x"],
        y=data["y"],
        hp=data["hp"],
        max_hp=data["max_hp"],
        attack=data["attack"],
        defense=data["defense"],
        base_attack=data["base_attack"],
        level=data["level"],
        xp=data["xp"],
    )
    if data["weapon"]:
        player.weapon = item_from_dict(data["weapon"])
    return player


# -- the map ---------------------------------------------------------------


def tile_map_to_dict(tile_map: TileMap) -> dict:
    return {
        "width": tile_map.width,
        "height": tile_map.height,
        "rows": tile_map.rows(),
        "rooms": [[room.x, room.y, room.w, room.h] for room in tile_map.rooms],
    }


def tile_map_from_dict(data: dict) -> TileMap:
    return TileMap(
        width=data["width"],
        height=data["height"],
        grid=[list(row) for row in data["rows"]],
        rooms=[Rect(*room) for room in data["rooms"]],
    )


# -- the random number generator -------------------------------------------


def rng_to_list(rng: Random) -> list:
    """``Random.getstate`` as something JSON can hold."""
    version, internal, gauss_next = rng.getstate()
    return [version, list(internal), gauss_next]


def rng_from_list(data: list) -> Random:
    rng = Random()
    version, internal, gauss_next = data
    rng.setstate((version, tuple(internal), gauss_next))
    return rng


# -- the whole run ---------------------------------------------------------


def game_to_dict(game: GameState) -> dict:
    """Everything needed to carry on exactly where the run left off."""
    return {
        "version": SAVE_VERSION,
        "seed": game.seed,
        "rng": rng_to_list(game.rng),
        "floor": game.floor,
        "turns": game.turns,
        "kills": game.kills,
        "items_found": game.items_found,
        "xp_earned": game.xp_earned,
        "game_over": game.game_over,
        "killed_by": game.killed_by,
        "width": game.width,
        "height": game.height,
        "tile_map": tile_map_to_dict(game.tile_map),
        "player": player_to_dict(game.player),
        "entities": [monster_to_dict(monster) for monster in game.entities],
        "items": [
            {"x": x, "y": y, "item": item_to_dict(item)}
            for (x, y), item in sorted(game.items.items())
        ],
        "inventory": {
            "capacity": game.inventory.capacity,
            "items": [item_to_dict(item) for item in game.inventory.items],
        },
        "stairs": list(game.stairs) if game.stairs else None,
        "messages": [
            {"text": message.text, "color": message.color}
            for message in game.messages
        ],
        # Visible tiles are recomputed on load, so only memory is stored.
        "explored": sorted([x, y] for x, y in game.explored),
    }


def game_from_dict(data: dict) -> GameState:
    """Rebuild a run from :func:`game_to_dict` output."""
    version = data.get("version")
    if version != SAVE_VERSION:
        raise SaveError(
            f"save file is version {version}, this game reads {SAVE_VERSION}"
        )

    game = GameState(
        seed=data["seed"],
        rng=rng_from_list(data["rng"]),
        tile_map=tile_map_from_dict(data["tile_map"]),
        player=player_from_dict(data["player"]),
        floor=data["floor"],
        turns=data["turns"],
        kills=data["kills"],
        items_found=data["items_found"],
        xp_earned=data["xp_earned"],
        game_over=data["game_over"],
        killed_by=data["killed_by"],
        width=data["width"],
        height=data["height"],
        entities=[monster_from_dict(entry) for entry in data["entities"]],
        items={
            (entry["x"], entry["y"]): item_from_dict(entry["item"])
            for entry in data["items"]
        },
        inventory=Inventory(
            capacity=data["inventory"]["capacity"],
            items=[item_from_dict(entry) for entry in data["inventory"]["items"]],
        ),
        stairs=tuple(data["stairs"]) if data["stairs"] else None,
        messages=[
            Message(text=entry["text"], color=entry["color"])
            for entry in data["messages"]
        ],
        explored={(x, y) for x, y in data["explored"]},
    )
    game.update_fov()
    return game


# -- files -----------------------------------------------------------------


def save_game(game: GameState, path: Path = DEFAULT_SAVE_PATH) -> Path:
    """Write ``game`` to ``path``, replacing anything already there."""
    path = Path(path)
    # Write beside the target and move into place, so an interrupted save
    # cannot leave a half-written file where a good one used to be.
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(game_to_dict(game)), encoding="utf-8")
    temporary.replace(path)
    return path


def load_game(path: Path = DEFAULT_SAVE_PATH) -> GameState:
    """Read a run back from ``path``."""
    path = Path(path)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise SaveError(f"no save file at {path}") from error
    except json.JSONDecodeError as error:
        raise SaveError(f"save file at {path} is not readable JSON") from error

    try:
        return game_from_dict(data)
    except SaveError:
        raise
    except (KeyError, TypeError, ValueError) as error:
        raise SaveError(f"save file at {path} is missing or malformed data") from error


def has_save(path: Path = DEFAULT_SAVE_PATH) -> bool:
    return Path(path).is_file()


def delete_save(path: Path = DEFAULT_SAVE_PATH) -> None:
    """Remove a save file if there is one. Never raises when there is not."""
    Path(path).unlink(missing_ok=True)
