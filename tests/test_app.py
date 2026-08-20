"""End-to-end checks that drive the real Textual app headlessly.

``run_test`` is async, so each test drives it through ``asyncio.run`` rather
than pulling in an async pytest plugin.
"""

from __future__ import annotations

import asyncio

from roguelike.entities import MONSTER_TEMPLATES, xp_for_level
from roguelike.inventory import ITEM_TEMPLATES
from roguelike.main import (
    GameOverScreen,
    GameScreen,
    InventoryScreen,
    MapView,
    MessageLog,
    PromptBar,
    RoguelikeApp,
    StatusPanel,
    TitleScreen,
)

TEMPLATES = {template.name: template for template in ITEM_TEMPLATES}
MONSTERS = {template.name: template for template in MONSTER_TEMPLATES}
SIZE = (100, 40)


def drive(coro_factory):
    return asyncio.run(coro_factory())


async def start(pilot):
    """Get past the title screen and into a run."""
    await pilot.pause()
    await pilot.press("enter")
    await pilot.pause()
    return pilot.app.game


def panel(app, selector: str) -> str:
    return app.screen.query_one(selector).render().plain


async def kill_the_player(pilot):
    """Stand the player next to something lethal and let it swing."""
    game = pilot.app.game
    game.player.hp = 1
    game.entities.clear()
    game.entities.append(
        MONSTERS["Orc"].spawn(game.player.x + 1, game.player.y, floor=1)
    )
    game.update_fov()
    await pilot.press("space")
    await pilot.pause()
    return game


# -- the title screen ------------------------------------------------------


def test_the_app_opens_on_the_title_screen():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            await pilot.pause()
            assert isinstance(app.screen, TitleScreen)
            assert app.game is None, "a run started before it was asked for"
            text = panel(app, "#title-panel")
            assert "ROGUELIKE" in text.replace(" ", "").upper()
            assert "1234" in text

    drive(scenario)


def test_rerolling_offers_a_different_seed():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            await pilot.pause()
            first = app.screen.next_seed
            await pilot.press("r")
            await pilot.pause()
            assert app.screen.next_seed != first
            assert str(app.screen.next_seed) in panel(app, "#title-panel")

    drive(scenario)


def test_beginning_a_run_uses_the_seed_on_offer():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            game = await start(pilot)
            assert isinstance(app.screen, GameScreen)
            assert game.seed == 1234
            assert game.floor == 1 and game.turns == 0

    drive(scenario)


def test_the_dungeon_cannot_be_played_from_the_title_screen():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            await pilot.pause()
            for key in ("right", "left", "i", "greater_than_sign"):
                await pilot.press(key)
            await pilot.pause()
            assert app.game is None
            assert isinstance(app.screen, TitleScreen)

    drive(scenario)


# -- playing ---------------------------------------------------------------


def test_the_map_renders_the_player_and_the_dungeon():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            await start(pilot)
            frame = app.screen.query_one(MapView).render().plain
            assert "@" in frame and "#" in frame and "." in frame

    drive(scenario)


def test_keys_move_the_player_and_spend_turns():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            game = await start(pilot)
            moved = 0
            for direction in ("right", "left", "down", "up", "d", "a", "s", "w"):
                before = game.player.position
                await pilot.press(direction)
                await pilot.pause()
                if game.player.position != before:
                    moved += 1
            assert moved > 0, "no key press ever moved the player"
            assert game.turns == moved
            assert game.tile_map.is_walkable(*game.player.position)

    drive(scenario)


def test_fog_hides_the_map_until_it_is_explored():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            game = await start(pilot)
            frame = app.screen.query_one(MapView).render().plain
            assert frame.count(" ") > frame.count("#")

            explored_before = len(game.explored)
            for key in ["down"] * 6 + ["right"] * 6:
                await pilot.press(key)
            await pilot.pause()
            assert len(game.explored) >= explored_before

    drive(scenario)


def test_the_map_draws_loot_the_player_can_see():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            game = await start(pilot)
            spot = (game.player.x + 1, game.player.y)
            game.items[spot] = TEMPLATES["Healing Potion"].spawn()
            assert spot in game.visible
            assert "!" in app.screen.query_one(MapView).render().plain

    drive(scenario)


def test_the_message_log_shows_what_happened():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            await start(pilot)
            log = app.screen.query_one(MessageLog)
            log.refresh_log()
            assert "descend" in log.render().plain

    drive(scenario)


def test_waiting_lets_the_dungeon_act():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            game = await start(pilot)
            await pilot.press("space")
            await pilot.pause()
            assert game.turns == 1

    drive(scenario)


def test_the_player_never_walks_through_a_wall():
    async def scenario():
        app = RoguelikeApp(seed=777)
        async with app.run_test(size=SIZE) as pilot:
            game = await start(pilot)
            keys = ["right", "down", "left", "up", "right", "right", "down", "down"]
            for _ in range(6):
                for key in keys:
                    await pilot.press(key)
            await pilot.pause()
            assert game.tile_map.is_walkable(*game.player.position)

    drive(scenario)


def test_the_descend_key_takes_the_stairs():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            game = await start(pilot)
            game.player.move_to(*game.stairs)
            game.update_fov()

            await pilot.press("greater_than_sign")
            await pilot.pause()
            assert game.floor == 2
            assert "Floor 2" in app.sub_title

    drive(scenario)


# -- the status panel (step 10) -------------------------------------------


def test_the_status_panel_reports_health_attack_floor_and_pack():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            game = await start(pilot)
            status = app.screen.query_one(StatusPanel)
            status.refresh_status()
            text = status.render().plain

            assert "FLOOR 1" in text
            assert "HP" in text and f"{game.player.hp}/{game.player.max_hp}" in text
            assert f"ATK {game.player.attack}" in text
            assert f"DEF {game.player.defense}" in text
            assert f"PACK 0/{game.inventory.capacity}" in text
            assert "bare hands" in text
            assert str(game.seed) in text

    drive(scenario)


def test_the_status_panel_follows_the_run():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            game = await start(pilot)
            status = app.screen.query_one(StatusPanel)

            game.inventory.add(TEMPLATES["Dagger"].spawn())
            game.inventory.add(TEMPLATES["Healing Potion"].spawn())
            game.use_item(0)  # wield the dagger
            status.refresh_status()
            text = status.render().plain
            assert "Dagger" in text
            assert "Healing Potion" in text, "the pack contents are not listed"
            assert f"ATK {game.player.attack}" in text
            assert "PACK 1/" in text

            game.player.move_to(*game.stairs)
            status.refresh_status()
            assert "Stairs here" in status.render().plain

    drive(scenario)


def test_the_status_panel_lists_monsters_in_view():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            game = await start(pilot)
            game.entities.clear()
            goblin = MONSTERS["Goblin"].spawn(game.player.x + 2, game.player.y)
            game.entities.append(goblin)
            game.update_fov()

            status = app.screen.query_one(StatusPanel)
            status.refresh_status()
            text = status.render().plain
            assert "NEARBY" in text
            assert "Goblin" in text
            assert f"{goblin.hp}/{goblin.max_hp}" in text

    drive(scenario)


def test_long_names_are_trimmed_to_the_panel_width():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            game = await start(pilot)
            game.inventory.add(TEMPLATES["Greater Healing Potion"].spawn())
            status = app.screen.query_one(StatusPanel)
            status.refresh_status()
            for line in status.render().plain.splitlines():
                assert len(line) <= 24, f"panel line overflows: {line!r}"

    drive(scenario)


# -- the inventory screen (step 7) ----------------------------------------


def test_the_inventory_screen_lists_what_you_carry():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            game = await start(pilot)
            game.inventory.add(TEMPLATES["Dagger"].spawn())
            game.inventory.add(TEMPLATES["Healing Potion"].spawn())

            await pilot.press("i")
            await pilot.pause()
            assert isinstance(app.screen, InventoryScreen)
            text = panel(app, "#inventory-panel")
            assert "Dagger" in text and "Healing Potion" in text
            assert "a)" in text and "b)" in text

            await pilot.press("escape")
            await pilot.pause()
            assert isinstance(app.screen, GameScreen)

    drive(scenario)


def test_an_empty_pack_says_so():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            await start(pilot)
            await pilot.press("i")
            await pilot.pause()
            assert "empty" in panel(app, "#inventory-panel").lower()

    drive(scenario)


def test_picking_a_letter_uses_that_item():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            game = await start(pilot)
            game.player.hp = 10
            game.inventory.add(TEMPLATES["Healing Potion"].spawn())

            await pilot.press("i")
            await pilot.pause()
            await pilot.press("a")
            await pilot.pause()

            assert game.player.hp > 10
            assert len(game.inventory) == 0
            assert isinstance(app.screen, GameScreen)

    drive(scenario)


def test_the_dungeon_cannot_be_played_while_the_pack_is_open():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            game = await start(pilot)
            await pilot.press("i")
            await pilot.pause()

            position, turns = game.player.position, game.turns
            for key in ("right", "left", "up", "down", "space", "n"):
                await pilot.press(key)
            await pilot.pause()

            assert game.player.position == position, "the player moved"
            assert game.turns == turns, "a turn was spent"
            assert isinstance(app.screen, InventoryScreen), "the pack was closed"

    drive(scenario)


# -- permadeath and the game over screen (step 9) -------------------------


def test_dying_shows_the_game_over_screen():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            await start(pilot)
            game = await kill_the_player(pilot)
            assert game.game_over
            assert isinstance(app.screen, GameOverScreen)
            assert "YOU DIED" in panel(app, "#game-over-panel")

    drive(scenario)


def test_the_game_over_screen_reports_the_run():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            game = await start(pilot)
            game.kills, game.items_found, game.floor = 7, 4, 3
            await kill_the_player(pilot)

            text = panel(app, "#game-over-panel")
            for label, value in game.run_summary():
                assert label in text, f"{label} missing from the run report"
                assert value in text, f"{label} value {value!r} missing"
            assert "Floors cleared" in text and "2" in text
            assert "an Orc" in text, "the killer was not named"

    drive(scenario)


def test_nothing_reaches_the_dungeon_behind_the_game_over_screen():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            game = await start(pilot)
            await kill_the_player(pilot)
            position, turns = game.player.position, game.turns

            for key in ("right", "left", "up", "down", "i", "greater_than_sign"):
                await pilot.press(key)
            await pilot.pause()

            assert game.player.position == position
            assert game.turns == turns
            assert isinstance(app.screen, GameOverScreen)

    drive(scenario)


def test_the_game_over_screen_hands_back_to_a_fresh_title_screen():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            game = await start(pilot)
            game.kills = 5
            await kill_the_player(pilot)

            await pilot.press("enter")
            await pilot.pause()
            assert isinstance(app.screen, TitleScreen)
            assert app.game is None, "the finished run is still live"

            text = panel(app, "#title-panel")
            assert "YOUR LAST RUN" in text
            assert "Monsters slain" in text and "5" in text
            assert app.screen.next_seed != 1234, "the new run reuses the dead seed"

    drive(scenario)


def test_a_run_after_death_starts_completely_fresh():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            dead = await start(pilot)
            dead.kills, dead.floor = 9, 4
            await kill_the_player(pilot)
            await pilot.press("enter")
            await pilot.pause()
            await pilot.press("enter")
            await pilot.pause()

            fresh = app.game
            assert fresh is not dead
            assert fresh.seed != dead.seed
            assert fresh.floor == 1
            assert fresh.kills == 0 and fresh.turns == 0
            assert fresh.player.hp == fresh.player.max_hp
            assert not fresh.game_over and fresh.killed_by is None
            assert len(fresh.inventory) == 0

    drive(scenario)


def test_abandoning_a_run_returns_to_the_title_screen():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            await start(pilot)
            await pilot.press("n")
            await pilot.pause()
            assert isinstance(app.screen, TitleScreen)
            assert app.game is None
            # An abandoned run is not reported as a finished one.
            assert "YOUR LAST RUN" not in panel(app, "#title-panel")

    drive(scenario)


# -- aiming a thrown item (stretch: ranged items) -------------------------


async def arm_with_targets(pilot, item_name: str = "Flask of Fire"):
    """Put three goblins in a row beside the player and a throwable in the pack."""
    game = pilot.app.game
    game.entities.clear()
    px, py = game.player.position
    for offset in (2, 3, 4):
        game.entities.append(MONSTERS["Goblin"].spawn(px + offset, py, floor=1))
    game.update_fov()
    game.inventory.add(TEMPLATES[item_name].spawn())
    return game


def test_choosing_a_thrown_item_starts_aiming_instead_of_using_it():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            await start(pilot)
            game = await arm_with_targets(pilot)
            await pilot.press("i")
            await pilot.pause()
            await pilot.press("a")
            await pilot.pause()

            screen = app.screen
            assert isinstance(screen, GameScreen)
            assert screen.aiming is not None, "the flask was used without aiming"
            assert len(game.inventory) == 1, "it left the pack before being thrown"
            assert game.turns == 0
            # The cursor starts on the nearest thing worth hitting.
            assert screen.aiming.cursor == game.targets_in_range(7)[0].position
            assert "Aiming" in screen.query_one(PromptBar).render().plain

    drive(scenario)


def test_the_aiming_cursor_and_blast_are_drawn():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            await start(pilot)
            await arm_with_targets(pilot)
            await pilot.press("i")
            await pilot.pause()
            await pilot.press("a")
            await pilot.pause()

            view = app.screen.query_one(MapView)
            assert view.cursor == app.screen.aiming.cursor
            assert len(view.blast) == 9, "a radius-1 blast covers nine tiles"
            assert view.cursor_valid

    drive(scenario)


def test_arrow_keys_aim_rather_than_walk():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            await start(pilot)
            game = await arm_with_targets(pilot)
            await pilot.press("i")
            await pilot.pause()
            await pilot.press("a")
            await pilot.pause()

            standing, cursor = game.player.position, app.screen.aiming.cursor
            await pilot.press("right")
            await pilot.pause()
            assert game.player.position == standing, "the player walked while aiming"
            assert app.screen.aiming.cursor == (cursor[0] + 1, cursor[1])
            assert game.turns == 0

    drive(scenario)


def test_tab_steps_through_the_monsters_you_could_hit():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            await start(pilot)
            game = await arm_with_targets(pilot)
            await pilot.press("i")
            await pilot.pause()
            await pilot.press("a")
            await pilot.pause()

            reachable = [m.position for m in game.targets_in_range(7)]
            assert len(reachable) >= 2, "need at least two targets to cycle"
            assert app.screen.aiming.cursor == reachable[0]
            await pilot.press("tab")
            await pilot.pause()
            assert app.screen.aiming.cursor == reachable[1]

    drive(scenario)


def test_confirming_throws_and_clears_the_overlay():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            await start(pilot)
            game = await arm_with_targets(pilot)
            await pilot.press("i")
            await pilot.pause()
            await pilot.press("a")
            await pilot.pause()
            await pilot.press("enter")
            await pilot.pause()

            assert app.screen.aiming is None
            assert app.screen.query_one(MapView).cursor is None
            assert not app.screen.query_one(PromptBar).display
            assert game.kills > 0, "the throw hit nothing"
            assert len(game.inventory) == 0
            assert game.turns == 1

    drive(scenario)


def test_aiming_somewhere_unreachable_is_refused_without_ending_the_aim():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            await start(pilot)
            game = await arm_with_targets(pilot)
            await pilot.press("i")
            await pilot.pause()
            await pilot.press("a")
            await pilot.pause()

            screen = app.screen
            screen.aiming.cursor = (game.player.x + 30, game.player.y)
            screen._show_aim()
            assert not screen.query_one(MapView).cursor_valid

            await pilot.press("enter")
            await pilot.pause()
            assert screen.aiming is not None, "the aim was thrown away"
            assert len(game.inventory) == 1
            assert game.turns == 0
            assert "No clear shot" in screen.query_one(PromptBar).render().plain

    drive(scenario)


def test_escape_puts_the_item_away():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            await start(pilot)
            game = await arm_with_targets(pilot)
            await pilot.press("i")
            await pilot.pause()
            await pilot.press("a")
            await pilot.pause()
            await pilot.press("escape")
            await pilot.pause()

            assert app.screen.aiming is None
            assert len(game.inventory) == 1, "the flask was lost"
            assert game.turns == 0
            assert app.screen.query_one(MapView).cursor is None

    drive(scenario)


def test_other_actions_are_held_back_while_aiming():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            await start(pilot)
            game = await arm_with_targets(pilot)
            await pilot.press("i")
            await pilot.pause()
            await pilot.press("a")
            await pilot.pause()

            for key in ("space", "greater_than_sign", "n", "i"):
                await pilot.press(key)
            await pilot.pause()
            assert isinstance(app.screen, GameScreen)
            assert app.screen.aiming is not None
            assert game.turns == 0

    drive(scenario)


# -- suspend and resume (stretch: save/load) ------------------------------


def test_a_run_can_be_suspended_and_picked_back_up(tmp_path):
    async def scenario():
        app = RoguelikeApp(seed=1234, save_path=tmp_path / "save.json")
        async with app.run_test(size=SIZE) as pilot:
            game = await start(pilot)
            for key in ["down"] * 4 + ["right"] * 5:
                await pilot.press(key)
            await pilot.pause()
            before = (game.seed, game.turns, game.player.position, len(game.explored))

            await pilot.press("S")
            await pilot.pause()
            assert isinstance(app.screen, TitleScreen)
            assert (tmp_path / "save.json").is_file()
            text = panel(app, "#title-panel")
            assert "continue" in text
            assert "YOUR LAST RUN" not in text, "a suspended run is not a finished one"

            await pilot.press("c")
            await pilot.pause()
            assert isinstance(app.screen, GameScreen)
            resumed = app.game
            assert (
                resumed.seed,
                resumed.turns,
                resumed.player.position,
                len(resumed.explored),
            ) == before

    drive(scenario)


def test_loading_consumes_the_save_so_a_run_cannot_be_rewound(tmp_path):
    async def scenario():
        save = tmp_path / "save.json"
        app = RoguelikeApp(seed=1234, save_path=save)
        async with app.run_test(size=SIZE) as pilot:
            await start(pilot)
            await pilot.press("S")
            await pilot.pause()
            assert save.is_file()

            await pilot.press("c")
            await pilot.pause()
            assert not save.is_file(), "the save survived being loaded"

    drive(scenario)


def test_the_title_screen_only_offers_continue_when_there_is_a_save(tmp_path):
    async def scenario():
        app = RoguelikeApp(seed=1234, save_path=tmp_path / "save.json")
        async with app.run_test(size=SIZE) as pilot:
            await pilot.pause()
            assert "continue" not in panel(app, "#title-panel")
            # Pressing it anyway must not blow up or start anything.
            await pilot.press("c")
            await pilot.pause()
            assert isinstance(app.screen, TitleScreen)
            assert app.game is None

    drive(scenario)


def test_dying_destroys_a_suspended_run(tmp_path):
    async def scenario():
        save = tmp_path / "save.json"
        app = RoguelikeApp(seed=1234, save_path=save)
        async with app.run_test(size=SIZE) as pilot:
            await start(pilot)
            await pilot.press("S")
            await pilot.pause()
            await pilot.press("c")
            await pilot.pause()
            await pilot.press("S")
            await pilot.pause()
            await pilot.press("c")
            await pilot.pause()
            await pilot.press("S")
            await pilot.pause()
            assert save.is_file()

            await pilot.press("c")
            await pilot.pause()
            await kill_the_player(pilot)
            assert isinstance(app.screen, GameOverScreen)
            assert not save.is_file(), "permadeath left a save file behind"

    drive(scenario)


def test_a_corrupt_save_is_reported_rather_than_crashing(tmp_path):
    async def scenario():
        save = tmp_path / "save.json"
        save.write_text("{ not json", encoding="utf-8")
        app = RoguelikeApp(seed=1234, save_path=save)
        async with app.run_test(size=SIZE) as pilot:
            await pilot.pause()
            await pilot.press("c")
            await pilot.pause()
            assert isinstance(app.screen, TitleScreen), "a bad save took down the app"
            assert app.game is None
            assert "not readable JSON" in panel(app, "#title-panel")

    drive(scenario)


def test_a_finished_run_cannot_be_suspended(tmp_path):
    async def scenario():
        save = tmp_path / "save.json"
        app = RoguelikeApp(seed=1234, save_path=save)
        async with app.run_test(size=SIZE) as pilot:
            await start(pilot)
            await kill_the_player(pilot)
            await pilot.press("S")
            await pilot.pause()
            assert not save.is_file()

    drive(scenario)


# -- levelling in the interface (stretch: character progression) ----------


def test_the_status_panel_shows_level_and_experience():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            game = await start(pilot)
            status = app.screen.query_one(StatusPanel)
            status.refresh_status()
            text = status.render().plain

            assert "LVL 1" in text
            assert "XP" in text
            assert f"0/{xp_for_level(1)}" in text

            game.player.gain_xp(xp_for_level(1) + 10)
            status.refresh_status()
            text = status.render().plain
            assert "LVL 2" in text
            assert f"10/{xp_for_level(2)}" in text
            assert f"{game.player.hp}/{game.player.max_hp}" in text

    drive(scenario)


def test_the_game_over_report_includes_the_level_reached():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            game = await start(pilot)
            game.player.gain_xp(xp_for_level(1) + xp_for_level(2))
            game.xp_earned = 500
            await kill_the_player(pilot)

            text = panel(app, "#game-over-panel")
            assert "Character level" in text and "3" in text
            assert "Experience" in text and "500" in text

    drive(scenario)


def test_levelling_up_is_reported_in_the_log():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            game = await start(pilot)
            game.entities.clear()
            game.entities.append(
                MONSTERS["Goblin"].spawn(game.player.x + 1, game.player.y, floor=1)
            )
            game.update_fov()
            game.player.gain_xp(xp_for_level(1) - 1)  # one kill from levelling

            for _ in range(6):
                await pilot.press("right")
            await pilot.pause()

            assert game.player.level == 2
            log = app.screen.query_one(MessageLog)
            log.refresh_log()
            assert "level 2" in log.render().plain

    drive(scenario)


def test_the_meters_read_correctly_without_colour():
    """Filled and empty use different glyphs, not just different colours."""

    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=SIZE) as pilot:
            game = await start(pilot)
            game.player.take_damage(game.player.max_hp // 2)
            status = app.screen.query_one(StatusPanel)
            status.refresh_status()

            lines = status.render().plain.splitlines()
            health = next(line for line in lines if line.startswith("HP"))
            experience = next(line for line in lines if line.startswith("XP"))

            assert StatusPanel.BAR_EMPTY in health, "a half-empty bar looks full"
            # No experience earned yet, so that meter is empty end to end.
            assert StatusPanel.BAR_FULL not in experience
            assert experience.count(StatusPanel.BAR_EMPTY) == StatusPanel.BAR_WIDTH

    drive(scenario)
