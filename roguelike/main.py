"""Textual front end: draws the dungeon and turns key presses into game actions.

The UI owns no game data. It reads a :class:`~roguelike.game.GameState`, asks
it to perform actions, and redraws.

A run moves through three screens: the title screen picks a seed, the game
screen plays it out, and the game over screen reports how it went before
handing back to the title screen with a fresh seed.
"""

from __future__ import annotations

from rich.text import Text
from textual.app import App, ComposeResult, RenderResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical
from textual.screen import ModalScreen, Screen
from textual.widget import Widget
from textual.widgets import Footer, Header, Static

from .game import GameState, camera_origin, random_seed
from .inventory import Inventory
from .map_gen import DOOR, FLOOR, STAIRS_DOWN, WALL

#: How each glyph is painted while it is in view. Entities carry their own colour.
TILE_STYLES: dict[str, str] = {
    WALL: "rgb(128,134,156)",
    FLOOR: "rgb(152,146,124)",
    DOOR: "bold rgb(212,156,72)",
    STAIRS_DOWN: "bold rgb(120,220,160)",
}
#: The same glyphs drawn from memory: seen before, not currently in view.
MEMORY_STYLES: dict[str, str] = {
    WALL: "rgb(56,59,74)",
    FLOOR: "rgb(62,60,54)",
    DOOR: "rgb(96,74,42)",
    STAIRS_DOWN: "rgb(58,92,74)",
}
DEFAULT_TILE_STYLE = "white"
UNSEEN = " "

#: Lines of message log kept on screen.
LOG_LINES = 6

#: Usable text width inside the status sidebar, after its padding.
PANEL_WIDTH = 24


def fit(text: str, width: int = PANEL_WIDTH) -> str:
    """Trim ``text`` to ``width`` columns, marking anything cut off."""
    return text if len(text) <= width else text[: width - 1] + "…"


class MapView(Widget):
    """Draws the slice of the dungeon around the player, under fog of war."""

    def __init__(self, game: GameState, **kwargs) -> None:
        super().__init__(**kwargs)
        self.game = game

    def render(self) -> RenderResult:
        width, height = self.size.width, self.size.height
        if width <= 0 or height <= 0:
            return Text("")

        game = self.game
        tile_map = game.tile_map
        origin_x, origin_y = camera_origin(
            game.player.x,
            game.player.y,
            width,
            height,
            tile_map.width,
            tile_map.height,
        )

        # Only entities in view are drawn, so monsters stay hidden in the dark.
        occupied = {
            entity.position: entity
            for entity in game.entities
            if entity.is_alive and entity.position in game.visible
        }
        if game.player.is_alive:
            occupied[game.player.position] = game.player

        frame = Text()
        for row in range(height):
            map_y = origin_y + row
            if row:
                frame.append("\n")
            if map_y >= tile_map.height:
                continue
            for column in range(width):
                map_x = origin_x + column
                if map_x >= tile_map.width:
                    break
                position = (map_x, map_y)
                visible = position in game.visible

                if visible and position in occupied:
                    entity = occupied[position]
                    frame.append(entity.char, style=f"bold {entity.color}")
                    continue

                item = game.items.get(position)
                if item is not None and visible:
                    frame.append(item.char, style=f"bold {item.color}")
                    continue

                tile = tile_map.get(map_x, map_y)
                if visible:
                    frame.append(tile, style=TILE_STYLES.get(tile, DEFAULT_TILE_STYLE))
                elif position in game.explored:
                    frame.append(tile, style=MEMORY_STYLES.get(tile, "grey35"))
                else:
                    frame.append(UNSEEN)
        return frame


class MessageLog(Static):
    """The last few things that happened."""

    def __init__(self, game: GameState, **kwargs) -> None:
        super().__init__(**kwargs)
        self.game = game

    def refresh_log(self) -> None:
        text = Text()
        for index, message in enumerate(self.game.recent_messages(LOG_LINES)):
            if index:
                text.append("\n")
            text.append(message.text, style=message.color)
        self.update(text)


class StatusPanel(Static):
    """Sidebar: health, gear, what is carried, and what is nearby."""

    BAR_WIDTH = 11
    RULE = "[rgb(60,60,75)]" + "─" * PANEL_WIDTH + "[/]"
    PACK_PREVIEW = 4
    NEARBY_PREVIEW = 4

    def __init__(self, game: GameState, **kwargs) -> None:
        super().__init__(**kwargs)
        self.game = game

    def _health_bar(self) -> str:
        player = self.game.player
        ratio = max(player.hp, 0) / player.max_hp if player.max_hp else 0.0
        filled = round(ratio * self.BAR_WIDTH)
        color = (
            "rgb(120,220,140)"
            if ratio > 0.5
            else "rgb(230,200,90)"
            if ratio > 0.25
            else "rgb(230,90,90)"
        )
        bar = (
            f"[{color}]{'█' * filled}[/]"
            f"[rgb(60,60,72)]{'█' * (self.BAR_WIDTH - filled)}[/]"
        )
        return f"HP {bar} [b]{max(player.hp, 0)}[/b]/{player.max_hp}"

    def _pack_lines(self) -> list[str]:
        pack = self.game.inventory
        lines = [f"[b]PACK[/b] [dim]{len(pack)}/{pack.capacity}[/dim]"]
        if not pack.items:
            return lines + ["[dim]nothing carried[/dim]"]
        for item in pack.items[: self.PACK_PREVIEW]:
            lines.append(f"[{item.color}]{item.char}[/] {fit(item.name, PANEL_WIDTH - 2)}")
        remaining = len(pack) - self.PACK_PREVIEW
        if remaining > 0:
            lines.append(f"[dim]+{remaining} more — press i[/dim]")
        return lines

    def _nearby_lines(self, seen) -> list[str]:
        lines = ["[b]NEARBY[/b]"]
        for monster in seen[: self.NEARBY_PREVIEW]:
            health = f"{monster.hp}/{monster.max_hp}"
            name = fit(monster.name, PANEL_WIDTH - len(health) - 3)
            padding = " " * max(1, PANEL_WIDTH - len(health) - len(name) - 2)
            lines.append(f"[{monster.color}]{monster.char}[/] {name}{padding}{health}")
        remaining = len(seen) - self.NEARBY_PREVIEW
        if remaining > 0:
            lines.append(f"[dim]+{remaining} more[/dim]")
        return lines

    def refresh_status(self) -> None:
        game = self.game
        player = game.player
        weapon = player.weapon.name if player.weapon else "bare hands"

        lines = [
            f"[b]FLOOR {game.floor}[/b]",
            self.RULE,
            self._health_bar(),
            f"ATK [b]{player.attack}[/b]    DEF [b]{player.defense}[/b]",
            f"[dim]{fit(weapon)}[/dim]",
            "",
            *self._pack_lines(),
        ]

        seen = game.visible_monsters()
        if seen:
            lines += ["", *self._nearby_lines(seen)]

        lines += [
            "",
            self.RULE,
            f"Turns [b]{game.turns}[/b]    Kills [b]{game.kills}[/b]",
            f"[dim]Seed {game.seed}[/dim]",
        ]
        if game.on_stairs():
            lines += ["", "[rgb(120,220,160)]> Stairs here[/]"]
        if game.game_over:
            lines += ["", "[bold rgb(255,80,80)]YOU DIED[/]"]
        self.update("\n".join(lines))


class InventoryScreen(ModalScreen[int | None]):
    """The pack, overlaid on the map.

    Dismisses with the chosen slot index, or None when closed without picking
    anything. The screen swallows every key press, so the dungeon cannot be
    played by accident while the pack is open.
    """

    def __init__(self, game: GameState) -> None:
        super().__init__()
        self.game = game

    def compose(self) -> ComposeResult:
        yield Static(self._panel_text(), id="inventory-panel")

    def _panel_text(self) -> str:
        pack = self.game.inventory
        lines = ["[b]INVENTORY[/b]", ""]
        if not pack.items:
            lines.append("[dim]Your pack is empty.[/dim]")
        else:
            lines += [
                f"[b]{letter}[/b])  [{item.color}]{item.char}[/]  {item.describe()}"
                for letter, item in pack.slots()
            ]
        lines += [
            "",
            f"[dim]{len(pack)}/{pack.capacity} carried[/dim]",
            "[dim]a-p use or wield · esc close[/dim]",
        ]
        return "\n".join(lines)

    def on_key(self, event) -> None:
        """Handle the pack's own keys and let nothing else through."""
        event.stop()
        event.prevent_default()

        if event.key in ("escape", "i", "q"):
            self.dismiss(None)
            return

        index = Inventory.slot_index(event.character or "")
        if index is not None and index < len(self.game.inventory):
            self.dismiss(index)


class GameOverScreen(ModalScreen[None]):
    """Permadeath: the run's final numbers, over the dungeon that ended it."""

    def __init__(self, game: GameState) -> None:
        super().__init__()
        self.game = game

    def compose(self) -> ComposeResult:
        yield Static(self._panel_text(), id="game-over-panel")

    def _panel_text(self) -> str:
        lines = [
            "[bold rgb(255,80,80)]YOU DIED[/]",
            "",
            "[dim]This run is over. There is no going back.[/dim]",
            "",
        ]
        lines += [
            f"{label:<16}[b]{value}[/b]" for label, value in self.game.run_summary()
        ]
        lines += ["", "[dim]enter — new game    q — quit[/dim]"]
        return "\n".join(lines)

    def on_key(self, event) -> None:
        """Handle the two keys this screen offers, and swallow everything else.

        Stopping the event is what keeps stray keys off the dungeon underneath,
        which is also why these are handled here rather than as bindings —
        a stopped event never reaches binding processing.
        """
        event.stop()
        event.prevent_default()

        if event.key in ("enter", "space", "n"):
            self.app.return_to_title(self.game)
        elif event.key == "q":
            self.app.exit()


class TitleScreen(Screen):
    """The new game screen: a fresh seed, and the keys to play it with."""

    BINDINGS = [
        Binding("enter,space", "begin", "Begin"),
        Binding("r", "reroll", "New seed"),
        Binding("q", "quit_app", "Quit"),
    ]

    def __init__(self, seed: int | None = None) -> None:
        super().__init__()
        self.next_seed = random_seed() if seed is None else seed

    def compose(self) -> ComposeResult:
        yield Static(self._panel_text(), id="title-panel")

    def _panel_text(self) -> str:
        lines = [
            "[b rgb(212,156,72)]R O G U E L I K E[/]",
            "[dim]a terminal dungeon crawler[/dim]",
            "",
            f"Seed  [b]{self.next_seed}[/b]  [dim](r — reroll)[/dim]",
            "",
            "[b]enter[/b]  begin the descent",
            "[b]q[/b]      quit",
            "",
            "[dim]arrows/wasd move · i pack · > stairs · space wait[/dim]",
            "[dim]walk into a monster to attack it[/dim]",
        ]
        summary = self.app.last_summary
        if summary:
            lines += ["", "[b]YOUR LAST RUN[/b]"]
            lines += [f"{label:<16}[b]{value}[/b]" for label, value in summary]
        return "\n".join(lines)

    def action_begin(self) -> None:
        self.app.start_run(self.next_seed)

    def action_reroll(self) -> None:
        self.next_seed = random_seed()
        self.query_one("#title-panel", Static).update(self._panel_text())

    def action_quit_app(self) -> None:
        self.app.exit()


class GameScreen(Screen):
    """The dungeon itself."""

    BINDINGS = [
        Binding("up,w,k", "move('up')", "Up"),
        Binding("down,s,j", "move('down')", "Down"),
        Binding("left,a,h", "move('left')", "Left"),
        Binding("right,d,l", "move('right')", "Right"),
        Binding("space,period", "wait", "Wait"),
        Binding("i", "inventory", "Pack"),
        Binding("greater_than_sign", "descend", "Descend"),
        Binding("n", "abandon", "New run"),
        Binding("q", "quit_app", "Quit"),
    ]

    def __init__(self, game: GameState) -> None:
        super().__init__()
        self.game = game
        self._reported_death = False

    def compose(self) -> ComposeResult:
        yield Header()
        with Horizontal(id="play-area"):
            with Vertical(id="left-column"):
                yield MapView(self.game, id="map")
                yield MessageLog(self.game, id="log")
            yield StatusPanel(self.game, id="status")
        yield Footer()

    def on_mount(self) -> None:
        self.redraw()

    def redraw(self) -> None:
        """Push the current game state to every panel."""
        self.app.sub_title = f"Floor {self.game.floor}"
        self.query_one(MapView).refresh()
        self.query_one(MessageLog).refresh_log()
        self.query_one(StatusPanel).refresh_status()

        if self.game.game_over and not self._reported_death:
            self._reported_death = True
            self.app.push_screen(GameOverScreen(self.game))

    def action_move(self, direction: str) -> None:
        if self.game.move_player_in_direction(direction):
            self.redraw()

    def action_wait(self) -> None:
        if self.game.wait():
            self.redraw()

    def action_descend(self) -> None:
        # Always redraw: a refused descent still logs why.
        self.game.descend()
        self.redraw()

    def action_inventory(self) -> None:
        """Open the pack, and use whatever the player picks."""

        def use_choice(index: int | None) -> None:
            if index is not None:
                self.game.use_item(index)
            self.redraw()

        self.app.push_screen(InventoryScreen(self.game), use_choice)

    def action_abandon(self) -> None:
        """Give up on this run and go back to the new game screen."""
        self.app.return_to_title(self.game if self.game.game_over else None)

    def action_quit_app(self) -> None:
        self.app.exit()


class RoguelikeApp(App):
    """The game application."""

    TITLE = "Roguelike"
    CSS = """
    Screen {
        background: rgb(16,16,22);
    }
    #play-area {
        height: 1fr;
    }
    #left-column {
        width: 1fr;
        height: 1fr;
    }
    MapView {
        width: 1fr;
        height: 1fr;
        background: rgb(16,16,22);
    }
    MessageLog {
        width: 1fr;
        height: 8;
        padding: 1 2;
        background: rgb(22,22,29);
        border-top: solid rgb(60,60,75);
    }
    StatusPanel {
        width: 28;
        height: 1fr;
        padding: 1 2;
        background: rgb(26,26,34);
        border-left: solid rgb(60,60,75);
    }
    TitleScreen {
        align: center middle;
    }
    #title-panel {
        width: 56;
        padding: 2 4;
        background: rgb(26,26,34);
        border: round rgb(120,125,150);
    }
    InventoryScreen, GameOverScreen {
        align: center middle;
    }
    #inventory-panel {
        width: 52;
        max-height: 80%;
        padding: 1 3;
        background: rgb(30,30,40);
        border: round rgb(120,125,150);
    }
    #game-over-panel {
        width: 52;
        padding: 2 4;
        background: rgb(32,24,28);
        border: round rgb(200,90,90);
    }
    """

    def __init__(self, seed: int | None = None) -> None:
        super().__init__()
        #: The run in progress, or None while on the title screen.
        self.game: GameState | None = None
        #: Stats from the last finished run, shown on the title screen.
        self.last_summary: list[tuple[str, str]] | None = None
        self._first_seed = seed

    def on_mount(self) -> None:
        self.push_screen(TitleScreen(self._first_seed))

    def start_run(self, seed: int | None = None) -> None:
        """Begin a run and hand over to the game screen."""
        self.game = GameState.new_game(seed=seed)
        self.switch_screen(GameScreen(self.game))

    def return_to_title(self, finished: GameState | None = None) -> None:
        """Report a finished run, then offer a fresh seed."""
        if finished is not None:
            self.last_summary = finished.run_summary()
        self.game = None
        self.sub_title = ""
        # Drop the game screen and any modal above it, then start clean.
        while len(self.screen_stack) > 1:
            self.pop_screen()
        self.push_screen(TitleScreen())


def run() -> None:
    """Console entry point."""
    RoguelikeApp().run()


if __name__ == "__main__":
    run()
