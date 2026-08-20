"""End-to-end checks that drive the real Textual app headlessly.

``run_test`` is async, so each test drives it through ``asyncio.run`` rather
than pulling in an async pytest plugin.
"""

from __future__ import annotations

import asyncio

from roguelike.entities import MONSTER_TEMPLATES
from roguelike.inventory import ITEM_TEMPLATES
from roguelike.main import (
    GameOverScreen,
    GameScreen,
    InventoryScreen,
    MapView,
    MessageLog,
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
