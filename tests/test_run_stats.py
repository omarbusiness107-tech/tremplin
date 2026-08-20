"""Permadeath: the numbers a finished run reports, and what ends it."""

from __future__ import annotations

from helpers import ScriptedRng, build

from roguelike.entities import with_article
from roguelike.game import GameState
from roguelike.inventory import ITEM_TEMPLATES, SCROLL_EFFECTS

TEMPLATES = {template.name: template for template in ITEM_TEMPLATES}
EFFECT_INDEX = {effect.__name__: index for index, effect in enumerate(SCROLL_EFFECTS)}


def summary_of(game: GameState) -> dict[str, str]:
    return dict(game.run_summary())


def test_a_fresh_run_has_nothing_to_report_yet():
    game = GameState.new_game(seed=1234)
    stats = summary_of(game)
    assert stats["Floors cleared"] == "0"
    assert stats["Monsters slain"] == "0"
    assert stats["Turns survived"] == "0"
    assert stats["Killed by"] == "unknown"


def test_floors_cleared_counts_the_ones_left_behind():
    game = GameState.new_game(seed=1234)
    assert game.floors_cleared == 0
    for expected in (1, 2, 3):
        game.player.move_to(*game.stairs)
        game.descend()
        assert game.floors_cleared == expected
        assert summary_of(game)["Deepest floor"] == str(expected + 1)


def test_the_summary_tracks_kills_turns_and_finds():
    game = build(["#######", "#@r...#", "#######"])
    game.items[(3, 1)] = TEMPLATES["Healing Potion"].spawn()

    game.move_player(1, 0)  # attack the rat
    game.move_player(1, 0)  # step onto its tile once it dies
    game.move_player(1, 0)  # walk over the potion

    stats = summary_of(game)
    assert stats["Monsters slain"] == "1"
    assert stats["Items found"] == "1"
    assert stats["Turns survived"] == str(game.turns)


def test_the_summary_reports_the_gear_you_died_with():
    game = build(["#####", "#@..#", "#####"])
    game.inventory.add(TEMPLATES["War Hammer"].spawn())
    game.use_item(0)

    stats = summary_of(game)
    assert stats["Wielding"] == "War Hammer"
    assert stats["Final attack"] == str(game.player.attack)


def test_bare_handed_is_reported_as_such():
    game = build(["#####", "#@..#", "#####"])
    assert summary_of(game)["Wielding"] == "bare hands"


def test_the_seed_is_reported_so_a_run_can_be_replayed():
    game = GameState.new_game(seed=98765)
    assert summary_of(game)["Seed"] == "98765"


# -- what killed you -------------------------------------------------------


def test_a_monster_is_named_as_the_killer():
    game = build(["#####", "#@o.#", "#####"])
    game.player.hp = 3
    while not game.game_over and game.turns < 20:
        game.wait()
    assert game.game_over
    assert summary_of(game)["Killed by"] == "an Orc"


def test_a_backfiring_scroll_takes_the_blame():
    game = build(["#####", "#@..#", "#####"])
    game.rng = ScriptedRng(EFFECT_INDEX["_scroll_backfire"])
    game.player.hp = 1
    game.inventory.add(TEMPLATES["Unknown Scroll"].spawn())

    game.use_item(0)
    assert game.game_over
    assert summary_of(game)["Killed by"] == "their own scroll"


def test_the_first_fatal_blow_keeps_the_credit():
    rows = ["#######", "#@ooo.#", "#######"]
    game = build(rows)
    game.player.hp = 1
    game.wait()
    assert game.killed_by == "an Orc"
    # Later swings must not overwrite it.
    game.wait()
    assert game.killed_by == "an Orc"


def test_articles_match_the_name():
    assert with_article("Orc") == "an Orc"
    assert with_article("Ogre") == "an Ogre"
    assert with_article("Goblin") == "a Goblin"
    assert with_article("Wraith") == "a Wraith"


# -- permadeath ------------------------------------------------------------


def test_death_is_final_for_every_action():
    game = build(["#####", "#@o.#", "#####"])
    game.stairs = game.player.position
    game.inventory.add(TEMPLATES["Healing Potion"].spawn())
    game.player.hp = 3
    while not game.game_over and game.turns < 20:
        game.wait()

    turns, hp = game.turns, game.player.hp
    assert game.move_player(1, 0) is False
    assert game.wait() is False
    assert game.use_item(0) is False
    assert game.descend() is False
    assert (game.turns, game.player.hp) == (turns, hp)
    assert len(game.inventory) == 1, "a potion was spent after death"


def test_a_new_game_shares_nothing_with_the_last_one():
    dead = GameState.new_game(seed=1234)
    dead.player.hp = 0
    dead.game_over = True
    dead.kills = 12
    dead.inventory.add(TEMPLATES["Dagger"].spawn())

    fresh = GameState.new_game(seed=4321)
    assert fresh.kills == 0 and fresh.items_found == 0
    assert fresh.turns == 0 and fresh.floor == 1
    assert fresh.killed_by is None and not fresh.game_over
    assert len(fresh.inventory) == 0
    assert fresh.player is not dead.player
    assert fresh.player.hp == fresh.player.max_hp
