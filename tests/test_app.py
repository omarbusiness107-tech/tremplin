"""End-to-end checks that drive the real Textual app headlessly.

``run_test`` is async, so each test drives it through ``asyncio.run`` rather
than pulling in an async pytest plugin.
"""

from __future__ import annotations

import asyncio

from roguelike.inventory import ITEM_TEMPLATES
from roguelike.main import (
    InventoryScreen,
    MapView,
    MessageLog,
    RoguelikeApp,
    StatusPanel,
)

TEMPLATES = {template.name: template for template in ITEM_TEMPLATES}


def drive(coro_factory):
    return asyncio.run(coro_factory())


def test_app_renders_the_player_and_moves_on_key_presses():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=(100, 32)) as pilot:
            await pilot.pause()
            frame = app.query_one(MapView).render().plain
            assert "@" in frame
            assert "#" in frame and "." in frame

            start = app.game.player.position
            moved = 0
            for direction in ("right", "left", "down", "up", "d", "a", "s", "w"):
                before = app.game.player.position
                await pilot.press(direction)
                await pilot.pause()
                if app.game.player.position != before:
                    moved += 1
            assert moved > 0, "no key press ever moved the player"
            assert app.game.turns == moved
            assert app.game.tile_map.is_walkable(*app.game.player.position)
            assert start != app.game.player.position or moved % 2 == 0

    drive(scenario)


def test_status_panel_reports_the_run():
    async def scenario():
        app = RoguelikeApp(seed=99)
        async with app.run_test(size=(100, 32)) as pilot:
            await pilot.pause()
            panel = app.query_one(StatusPanel)
            text = panel.render().plain
            assert "Floor" in text and "HP" in text
            assert str(app.game.seed) in text

    drive(scenario)


def test_pressing_n_rolls_a_fresh_dungeon():
    async def scenario():
        app = RoguelikeApp(seed=5)
        async with app.run_test(size=(100, 32)) as pilot:
            await pilot.pause()
            before = app.game
            await pilot.press("n")
            await pilot.pause()
            assert app.game is not before
            assert app.game.seed != before.seed
            # Both panels must follow the new state, not the abandoned one.
            assert app.query_one(MapView).game is app.game
            assert app.query_one(StatusPanel).game is app.game

    drive(scenario)


def test_player_never_walks_through_a_wall():
    async def scenario():
        app = RoguelikeApp(seed=777)
        async with app.run_test(size=(100, 32)) as pilot:
            await pilot.pause()
            keys = ["right", "down", "left", "up", "right", "right", "down", "down"]
            for _ in range(6):
                for key in keys:
                    await pilot.press(key)
            await pilot.pause()
            assert app.game.tile_map.is_walkable(*app.game.player.position)

    drive(scenario)


def test_fog_hides_the_map_until_it_is_explored():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=(100, 40)) as pilot:
            await pilot.pause()
            frame = app.query_one(MapView).render().plain
            # Far more of the screen is dark than is drawn.
            assert frame.count(" ") > frame.count("#")

            explored_before = len(app.game.explored)
            for key in ["down"] * 6 + ["right"] * 6:
                await pilot.press(key)
            await pilot.pause()
            assert len(app.game.explored) >= explored_before

    drive(scenario)


def test_the_message_log_shows_what_happened():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=(100, 40)) as pilot:
            await pilot.pause()
            log = app.query_one(MessageLog)
            log.refresh_log()
            assert "descend" in log.render().plain

    drive(scenario)


def test_waiting_lets_the_dungeon_act():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=(100, 40)) as pilot:
            await pilot.pause()
            await pilot.press("space")
            await pilot.pause()
            assert app.game.turns == 1

    drive(scenario)


def test_the_status_panel_announces_death():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=(100, 40)) as pilot:
            await pilot.pause()
            app.game.player.hp = 0
            app.game.game_over = True
            panel = app.query_one(StatusPanel)
            panel.refresh_status()
            assert "YOU DIED" in panel.render().plain

            # A dead player's keys do nothing.
            turns = app.game.turns
            await pilot.press("right")
            await pilot.pause()
            assert app.game.turns == turns

    drive(scenario)


def test_the_inventory_screen_lists_what_you_carry():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=(100, 40)) as pilot:
            await pilot.pause()
            app.game.inventory.add(TEMPLATES["Dagger"].spawn())
            app.game.inventory.add(TEMPLATES["Healing Potion"].spawn())

            await pilot.press("i")
            await pilot.pause()
            screen = app.screen
            assert isinstance(screen, InventoryScreen)
            panel = screen.query_one("#inventory-panel").render().plain
            assert "Dagger" in panel and "Healing Potion" in panel
            assert "a)" in panel and "b)" in panel

            await pilot.press("escape")
            await pilot.pause()
            assert not isinstance(app.screen, InventoryScreen)

    drive(scenario)


def test_an_empty_pack_says_so():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=(100, 40)) as pilot:
            await pilot.pause()
            await pilot.press("i")
            await pilot.pause()
            panel = app.screen.query_one("#inventory-panel").render().plain
            assert "empty" in panel.lower()

    drive(scenario)


def test_picking_a_letter_uses_that_item():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=(100, 40)) as pilot:
            await pilot.pause()
            app.game.player.hp = 10
            app.game.inventory.add(TEMPLATES["Healing Potion"].spawn())

            await pilot.press("i")
            await pilot.pause()
            await pilot.press("a")
            await pilot.pause()

            assert app.game.player.hp > 10
            assert len(app.game.inventory) == 0
            assert not isinstance(app.screen, InventoryScreen)

    drive(scenario)


def test_the_dungeon_cannot_be_played_while_the_pack_is_open():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=(100, 40)) as pilot:
            await pilot.pause()
            await pilot.press("i")
            await pilot.pause()

            position, turns = app.game.player.position, app.game.turns
            for key in ("right", "left", "up", "down", "space", "n"):
                await pilot.press(key)
            await pilot.pause()

            assert app.game.player.position == position, "the player moved"
            assert app.game.turns == turns, "a turn was spent"
            assert isinstance(app.screen, InventoryScreen), "the pack was closed"

    drive(scenario)


def test_the_descend_key_takes_the_stairs():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=(100, 40)) as pilot:
            await pilot.pause()
            app.game.player.move_to(*app.game.stairs)
            app.game.update_fov()

            await pilot.press("greater_than_sign")
            await pilot.pause()
            assert app.game.floor == 2
            assert "Floor 2" in app.sub_title

    drive(scenario)


def test_the_map_draws_loot_the_player_can_see():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=(100, 40)) as pilot:
            await pilot.pause()
            game = app.game
            # Drop a potion right next to the player, inside the lit radius.
            spot = (game.player.x + 1, game.player.y)
            game.items[spot] = TEMPLATES["Healing Potion"].spawn()
            assert spot in game.visible
            assert "!" in app.query_one(MapView).render().plain

    drive(scenario)


def test_the_status_panel_shows_gear_and_the_stairs_prompt():
    async def scenario():
        app = RoguelikeApp(seed=1234)
        async with app.run_test(size=(100, 40)) as pilot:
            await pilot.pause()
            panel = app.query_one(StatusPanel)

            panel.refresh_status()
            assert "bare hands" in panel.render().plain

            app.game.inventory.add(TEMPLATES["Dagger"].spawn())
            app.game.use_item(0)
            panel.refresh_status()
            assert "Dagger" in panel.render().plain

            app.game.player.move_to(*app.game.stairs)
            panel.refresh_status()
            assert "Stairs here" in panel.render().plain

    drive(scenario)
