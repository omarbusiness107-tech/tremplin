"""Monster behaviours: what each species does with its turn."""

from __future__ import annotations

from helpers import build

from roguelike.entities import MONSTER_TEMPLATES, Behaviour, templates_for_floor

TEMPLATES = {template.name: template for template in MONSTER_TEMPLATES}


def spawn_into(game, name: str, x: int, y: int, floor: int = 1):
    """Replace whatever is on the floor with one monster of a given species."""
    game.entities.clear()
    monster = TEMPLATES[name].spawn(x, y, floor=floor)
    game.entities.append(monster)
    game.update_fov()
    return monster


# A straight corridor: the player at one end, a monster at the other.
CORRIDOR = ["##########", "#@.......#", "##########"]

# Two rooms joined by a door; doors block sight, so the far room is hidden.
TWO_ROOMS = [
    "##########",
    "#@.......#",
    "#........#",
    "####+#####",
    "#........#",
    "#........#",
    "##########",
]

# A corridor with a side passage the player can duck into, out of sight.
DOGLEG = [
    "##########",
    "#@.......#",
    "#.########",
    "#.########",
    "#........#",
    "##########",
]


def test_every_species_declares_a_behaviour():
    for template in MONSTER_TEMPLATES:
        assert isinstance(template.behaviour, Behaviour)
        assert template.spawn(0, 0).behaviour is template.behaviour


def test_the_species_mix_changes_behaviour_with_depth():
    shallow = {t.behaviour for t in templates_for_floor(1)}
    deep = {t.behaviour for t in templates_for_floor(6)}
    assert shallow != deep
    assert Behaviour.STALKER in deep and Behaviour.STALKER not in shallow


# -- hunter ----------------------------------------------------------------


def test_a_hunter_closes_in_while_it_can_see_you():
    game = build(CORRIDOR)
    goblin = spawn_into(game, "Goblin", 6, 1)
    game.wait()
    assert goblin.x < 6


def test_a_hunter_gives_up_the_moment_it_loses_sight():
    game = build(DOGLEG)
    orc = spawn_into(game, "Orc", 8, 1, floor=2)
    game.wait()
    assert orc.last_seen == (1, 1)

    game.player.move_to(1, 4)  # duck around the corner
    game.update_fov()
    assert not game._can_see_player(orc)

    parked = orc.position
    for _ in range(4):
        game.wait()
    assert orc.position == parked, "the hunter kept tracking without sight"


# -- skittish --------------------------------------------------------------


def test_a_healthy_skittish_monster_still_comes_at_you():
    game = build(CORRIDOR)
    rat = spawn_into(game, "Rat", 5, 1)
    assert not rat.is_hurt
    game.wait()
    assert rat.x < 5


def test_a_wounded_skittish_monster_runs():
    game = build(CORRIDOR)
    rat = spawn_into(game, "Rat", 4, 1)
    rat.hp = 1
    assert rat.is_hurt

    for expected in (5, 6, 7):
        game.wait()
        assert rat.x == expected, "the rat did not keep running"


def test_a_wounded_skittish_monster_breaks_off_rather_than_fighting():
    game = build(["########", "#@r....#", "########"])
    rat = game.entities[0]
    rat.hp = 1
    full_hp = game.player.hp

    game.wait()
    assert game.player.hp == full_hp, "the fleeing rat still attacked"
    assert rat.x > 2


def test_a_cornered_skittish_monster_stays_put_rather_than_walking_into_stone():
    game = build(["#####", "#@r#.", "#####"])
    rat = game.entities[0]
    rat.hp = 1
    game.wait()
    assert game.tile_map.is_walkable(*rat.position)


# -- slow ------------------------------------------------------------------


def test_a_slow_monster_acts_every_other_turn():
    game = build(CORRIDOR, floor=4)
    ogre = spawn_into(game, "Ogre", 8, 1, floor=4)

    moved = []
    for _ in range(6):
        before = ogre.position
        game.wait()
        moved.append(ogre.position != before)
    # It rests first, then alternates.
    assert moved == [False, True, False, True, False, True]


def test_a_slow_monster_still_lands_blows_on_its_active_turns():
    game = build(["#####", "#@O.#", "#####"], floor=4)
    full_hp = game.player.hp
    game.wait()  # resting
    assert game.player.hp == full_hp
    game.wait()  # swinging
    assert game.player.hp < full_hp


# -- stalker ---------------------------------------------------------------


def test_a_stalker_keeps_coming_after_losing_sight():
    game = build(DOGLEG, floor=6)
    wraith = spawn_into(game, "Wraith", 8, 1, floor=6)
    game.wait()
    assert wraith.last_seen == (1, 1)

    game.player.move_to(1, 4)
    game.update_fov()
    assert not game._can_see_player(wraith)

    approached = wraith.x
    for _ in range(3):
        game.wait()
        assert wraith.x < approached, "the stalker stopped following"
        approached = wraith.x


def test_a_stalker_forgets_once_it_reaches_the_last_known_spot():
    # Two rooms joined by a door. Doors block sight, so once the player is
    # through one the stalker has only the remembered spot to go on.
    game = build(TWO_ROOMS, floor=6)
    wraith = spawn_into(game, "Wraith", 8, 1, floor=6)
    game.wait()
    assert wraith.last_seen == (1, 1)

    game.player.move_to(1, 5)  # through the door, into the far room
    game.update_fov()
    assert not game._can_see_player(wraith)

    for _ in range(20):
        game.wait()
        if wraith.last_seen is None:
            break
    assert wraith.last_seen is None, "the stalker never gave up the old scent"
    assert wraith.position == (1, 1), "it should have walked to the remembered spot"


def test_a_stalker_re_acquires_the_player_on_the_way():
    """Following a remembered spot can walk it back into line of sight."""
    game = build(DOGLEG, floor=6)
    wraith = spawn_into(game, "Wraith", 8, 1, floor=6)
    game.wait()

    game.player.move_to(1, 4)
    game.update_fov()
    assert not game._can_see_player(wraith)

    for _ in range(10):
        game.wait()
        if game._can_see_player(wraith):
            break
    assert game._can_see_player(wraith), "the stalker never found the player again"

    # last_seen is refreshed at the start of the monster's next turn.
    game.wait()
    assert wraith.last_seen == (1, 4), "it is still tracking the stale position"


def test_a_stalker_with_nothing_to_remember_holds_position():
    game = build(DOGLEG, floor=6)
    wraith = spawn_into(game, "Wraith", 8, 4, floor=6)
    wraith.last_seen = None
    game.player.move_to(1, 1)
    game.update_fov()
    assert not game._can_see_player(wraith)

    parked = wraith.position
    for _ in range(3):
        game.wait()
    assert wraith.position == parked


# -- shared invariants -----------------------------------------------------


def test_no_behaviour_ever_walks_through_stone_or_stacks():
    rows = ["############", "#@..rgoOW..#", "############"]
    game = build(rows, floor=6)
    for _ in range(15):
        game.wait()
        positions = [monster.position for monster in game.entities]
        assert len(positions) == len(set(positions)), "two monsters share a tile"
        for monster in game.entities:
            assert game.tile_map.is_walkable(*monster.position)
            assert monster.position != game.player.position
