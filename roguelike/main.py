"""Textual front end: draws the dungeon and turns key presses into game actions.

The UI owns no game data. It reads a :class:`~roguelike.game.GameState`, asks
it to perform actions, and redraws.
"""

from __future__ import annotations

from rich.text import Text
from textual.app import App, ComposeResult, RenderResult
from textual.binding import Binding
from textual.containers import Horizontal
from textual.widget import Widget
from textual.widgets import Footer, Header, Static

from .game import GameState, camera_origin
from .map_gen import DOOR, FLOOR, STAIRS_DOWN, WALL

# How each glyph is painted. Entities carry their own colour.
TILE_STYLES: dict[str, str] = {
    WALL: "rgb(90,95,110)",
    FLOOR: "rgb(130,125,110)",
    DOOR: "bold rgb(190,140,60)",
    STAIRS_DOWN: "bold rgb(120,220,160)",
}
DEFAULT_TILE_STYLE = "white"


class MapView(Widget):
    """Draws the slice of the dungeon around the player."""

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

        # Index entities by position so each tile is a single dict lookup.
        occupied = {
            entity.position: entity for entity in game.entities if entity.is_alive
        }
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
                entity = occupied.get((map_x, map_y))
                if entity is not None:
                    frame.append(entity.char, style=f"bold {entity.color}")
                    continue
                tile = tile_map.get(map_x, map_y)
                frame.append(tile, style=TILE_STYLES.get(tile, DEFAULT_TILE_STYLE))
        return frame


class StatusPanel(Static):
    """Sidebar with the run's vital statistics."""

    def __init__(self, game: GameState, **kwargs) -> None:
        super().__init__(**kwargs)
        self.game = game

    def refresh_status(self) -> None:
        game = self.game
        player = game.player
        lines = [
            "[b]STATUS[/b]",
            "",
            f"Floor    [b]{game.floor}[/b]",
            f"HP       [b]{player.hp}[/b]/{player.max_hp}",
            f"Attack   [b]{player.attack}[/b]",
            f"Defense  [b]{player.defense}[/b]",
            "",
            f"Turns    {game.turns}",
            f"Position {player.x},{player.y}",
            f"Seed     {game.seed}",
            "",
            "[dim]@ you   # wall[/dim]",
            "[dim]. floor + door[/dim]",
        ]
        self.update("\n".join(lines))


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
    MapView {
        width: 1fr;
        height: 1fr;
        background: rgb(16,16,22);
    }
    StatusPanel {
        width: 24;
        height: 1fr;
        padding: 1 2;
        background: rgb(26,26,34);
        border-left: solid rgb(60,60,75);
    }
    """

    BINDINGS = [
        Binding("up,w,k", "move('up')", "Up"),
        Binding("down,s,j", "move('down')", "Down"),
        Binding("left,a,h", "move('left')", "Left"),
        Binding("right,d,l", "move('right')", "Right"),
        Binding("n", "new_game", "New dungeon"),
        Binding("q", "quit", "Quit"),
    ]

    def __init__(self, seed: int | None = None) -> None:
        super().__init__()
        self.game = GameState.new_game(seed=seed)

    def compose(self) -> ComposeResult:
        yield Header()
        with Horizontal(id="play-area"):
            yield MapView(self.game, id="map")
            yield StatusPanel(self.game, id="status")
        yield Footer()

    def on_mount(self) -> None:
        self.sub_title = f"Floor {self.game.floor}"
        self.query_one(StatusPanel).refresh_status()

    def redraw(self) -> None:
        """Push the current game state to both panels."""
        self.query_one(MapView).refresh()
        self.query_one(StatusPanel).refresh_status()

    def action_move(self, direction: str) -> None:
        if self.game.move_player_in_direction(direction):
            self.redraw()

    def action_new_game(self) -> None:
        """Abandon this dungeon and roll a fresh one."""
        self.game = GameState.new_game()
        for widget in (self.query_one(MapView), self.query_one(StatusPanel)):
            widget.game = self.game
        self.sub_title = f"Floor {self.game.floor}"
        self.redraw()


def run() -> None:
    """Console entry point."""
    RoguelikeApp().run()


if __name__ == "__main__":
    run()
