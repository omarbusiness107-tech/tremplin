"""Textual front end: draws the dungeon and turns key presses into game actions.

The UI owns no game data. It reads a :class:`~roguelike.game.GameState`, asks
it to perform actions, and redraws.
"""

from __future__ import annotations

from rich.text import Text
from textual.app import App, ComposeResult, RenderResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical
from textual.screen import ModalScreen
from textual.widget import Widget
from textual.widgets import Footer, Header, Static

from .game import GameState, camera_origin
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
    """Sidebar with the run's vital statistics."""

    BAR_WIDTH = 16

    def __init__(self, game: GameState, **kwargs) -> None:
        super().__init__(**kwargs)
        self.game = game

    def _health_bar(self) -> str:
        player = self.game.player
        ratio = player.hp / player.max_hp if player.max_hp else 0.0
        filled = round(ratio * self.BAR_WIDTH)
        color = (
            "rgb(120,220,140)"
            if ratio > 0.5
            else "rgb(230,200,90)"
            if ratio > 0.25
            else "rgb(230,90,90)"
        )
        return (
            f"[{color}]{'█' * filled}[/][rgb(60,60,72)]"
            f"{'█' * (self.BAR_WIDTH - filled)}[/]"
        )

    def refresh_status(self) -> None:
        game = self.game
        player = game.player
        seen = game.visible_monsters()
        lines = [
            "[b]STATUS[/b]",
            "",
            f"Floor    [b]{game.floor}[/b]",
            f"HP       [b]{max(player.hp, 0)}[/b]/{player.max_hp}",
            self._health_bar(),
            "",
            f"Attack   [b]{player.attack}[/b]",
            f"Defense  [b]{player.defense}[/b]",
            f"Weapon   {player.weapon.name if player.weapon else '[dim]bare hands[/]'}",
            "",
            f"Pack     {len(game.inventory)}/{game.inventory.capacity}",
            f"Kills    {game.kills}",
            f"Turns    {game.turns}",
            f"In view  {len(seen)}",
            "",
            f"[dim]Seed {game.seed}[/dim]",
        ]
        if game.on_stairs():
            lines += ["", "[rgb(120,220,160)]Stairs here — press >[/]"]
        if seen:
            lines += ["", "[b]NEARBY[/b]"]
            lines += [
                f"[{monster.color}]{monster.char}[/] {monster.name} "
                f"{monster.hp}/{monster.max_hp}"
                for monster in seen[:5]
            ]
        if game.game_over:
            lines += ["", "[bold rgb(255,80,80)]YOU DIED[/]", "[dim]n — new run[/dim]"]
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
        width: 26;
        height: 1fr;
        padding: 1 2;
        background: rgb(26,26,34);
        border-left: solid rgb(60,60,75);
    }
    InventoryScreen {
        align: center middle;
    }
    #inventory-panel {
        width: 52;
        max-height: 80%;
        padding: 1 3;
        background: rgb(30,30,40);
        border: round rgb(120,125,150);
    }
    """

    BINDINGS = [
        Binding("up,w,k", "move('up')", "Up"),
        Binding("down,s,j", "move('down')", "Down"),
        Binding("left,a,h", "move('left')", "Left"),
        Binding("right,d,l", "move('right')", "Right"),
        Binding("space,period", "wait", "Wait"),
        Binding("i", "inventory", "Inventory"),
        Binding("greater_than_sign", "descend", "Descend"),
        Binding("n", "new_game", "New run"),
        Binding("q", "quit", "Quit"),
    ]

    def __init__(self, seed: int | None = None) -> None:
        super().__init__()
        self.game = GameState.new_game(seed=seed)

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
        self.sub_title = f"Floor {self.game.floor}"
        self.query_one(MapView).refresh()
        self.query_one(MessageLog).refresh_log()
        self.query_one(StatusPanel).refresh_status()

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

        self.push_screen(InventoryScreen(self.game), use_choice)

    def action_new_game(self) -> None:
        """Abandon this run and roll a fresh dungeon."""
        self.game = GameState.new_game()
        for widget in (
            self.query_one(MapView),
            self.query_one(MessageLog),
            self.query_one(StatusPanel),
        ):
            widget.game = self.game
        self.redraw()


def run() -> None:
    """Console entry point."""
    RoguelikeApp().run()


if __name__ == "__main__":
    run()
