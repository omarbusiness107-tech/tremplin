"""Dedup and upsert rules, exercised against a real Postgres.

Skipped unless TEST_DATABASE_URL points at a database with the migrations
applied -- these assertions are about SQL behaviour (unique constraints,
the status trigger, updated_at semantics), which a mock would not catch.

    createdb tracker_test
    DATABASE_URL=postgresql://.../tracker_test ./supabase/local-dev/apply.sh
    TEST_DATABASE_URL=postgresql://.../tracker_test pytest tests/test_store.py
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta

import pytest

from morocco_scraper.models import Opportunity, OpportunityType, RunStats
from morocco_scraper.normalize import MOROCCO_TZ

TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL, reason="set TEST_DATABASE_URL to run store tests"
)

SOURCE_KEY = "test_source"
OTHER_SOURCE_KEY = "test_source_b"


@pytest.fixture
def store():
    from morocco_scraper.store import PostgresStore

    store = PostgresStore(TEST_DATABASE_URL)
    store.ensure_source(
        key=SOURCE_KEY, name="Test Source", homepage_url="https://example.test", notes=""
    )
    _clean(store)
    try:
        yield store
    finally:
        _clean(store)
        with store.conn.cursor() as cur:
            cur.execute(
                "delete from sources where key = any(%s)", ([SOURCE_KEY, OTHER_SOURCE_KEY],)
            )
        store.close()


def _clean(store) -> None:
    with store.conn.cursor() as cur:
        keys = (SOURCE_KEY, OTHER_SOURCE_KEY)
        cur.execute("delete from scraper_runs where source_key = any(%s)", (list(keys),))
        cur.execute("delete from opportunities where source_key = any(%s)", (list(keys),))


# Fixed, not now()-relative: two calls must produce an identical
# content_hash, which is exactly what "unchanged" depends on.
FIXED_DEADLINE = datetime(2030, 6, 1, 16, 30, tzinfo=MOROCCO_TZ)


def make(external_id: str = "a1", **overrides) -> Opportunity:
    defaults = dict(
        source_key=SOURCE_KEY,
        external_id=external_id,
        application_link=f"https://example.test/{external_id}",
        title="Concours de recrutement d'un Ingénieur d'État",
        type=OpportunityType.CONCOURS,
        institution="Ministère de l'Intérieur",
        domains=["software-it"],
        deadline=FIXED_DEADLINE,
        positions_available=3,
    )
    return Opportunity(**{**defaults, **overrides})


def row(store, external_id: str) -> dict:
    with store.conn.cursor() as cur:
        cur.execute(
            "select status, updated_at, last_seen_at, discovered_at, positions_available, domains "
            "from opportunities where source_key = %s and external_id = %s",
            (SOURCE_KEY, external_id),
        )
        status, updated_at, last_seen_at, discovered_at, positions, domains = cur.fetchone()
    return {
        "status": status,
        "updated_at": updated_at,
        "last_seen_at": last_seen_at,
        "discovered_at": discovered_at,
        "positions": positions,
        "domains": domains,
    }


class TestUpsert:
    def test_first_sight_of_a_listing_creates_it(self, store):
        assert store.upsert(make()) == "created"

    def test_rescraping_an_unchanged_listing_does_not_duplicate_it(self, store):
        store.upsert(make())
        assert store.upsert(make()) == "unchanged"

        with store.conn.cursor() as cur:
            cur.execute(
                "select count(*) from opportunities where source_key = %s", (SOURCE_KEY,)
            )
            assert cur.fetchone()[0] == 1

    def test_an_unchanged_rescrape_touches_last_seen_but_not_updated_at(self, store):
        store.upsert(make())
        before = row(store, "a1")

        store.upsert(make())
        after = row(store, "a1")

        assert after["updated_at"] == before["updated_at"]
        assert after["last_seen_at"] >= before["last_seen_at"]
        assert after["discovered_at"] == before["discovered_at"]

    def test_a_changed_listing_is_updated_in_place(self, store):
        store.upsert(make())
        before = row(store, "a1")

        assert store.upsert(make(positions_available=10)) == "updated"
        after = row(store, "a1")

        assert after["positions"] == 10
        assert after["updated_at"] > before["updated_at"]
        # date_discovered must survive an update.
        assert after["discovered_at"] == before["discovered_at"]

    def test_genuinely_different_listings_both_land(self, store):
        store.upsert(make("a1"))
        assert store.upsert(make("a2", title="Concours de recrutement d'un Technicien")) == "created"

    def test_one_source_may_publish_two_listings_that_look_identical(self, store):
        """emploi-public.ma really does this: same grade, same administration,
        same closing date, different speciality and post count. Collapsing
        them on fingerprint would silently drop a real opportunity."""
        first = make("a1", positions_available=3)
        second = make("a2", positions_available=2)
        assert first.fingerprint == second.fingerprint

        assert store.upsert(first) == "created"
        assert store.upsert(second) == "created"

        with store.conn.cursor() as cur:
            cur.execute(
                "select count(*) from opportunities where source_key = %s", (SOURCE_KEY,)
            )
            assert cur.fetchone()[0] == 2

    def test_the_same_opportunity_from_another_source_is_suppressed(self, store):
        """Two sites carrying one call should produce one card, and the first
        finder keeps the row rather than the two overwriting each other."""
        store.upsert(make("a1"))
        store.ensure_source(
            key=OTHER_SOURCE_KEY, name="Other", homepage_url="https://other.test", notes=""
        )

        duplicate = make("b1")
        duplicate.source_key = OTHER_SOURCE_KEY
        assert store.upsert(duplicate) == "unchanged"

        with store.conn.cursor() as cur:
            cur.execute("select source_key from opportunities where fingerprint = %s",
                        (duplicate.fingerprint,))
            assert [r[0] for r in cur.fetchall()] == [SOURCE_KEY]


class TestStatus:
    @pytest.mark.parametrize(
        "days,expected",
        [(40, "open"), (3, "closing_soon"), (-1, "closed")],
    )
    def test_status_is_derived_from_the_deadline(self, store, days, expected):
        store.upsert(make(deadline=datetime.now(MOROCCO_TZ) + timedelta(days=days)))
        assert row(store, "a1")["status"] == expected

    def test_a_listing_without_a_deadline_is_unknown_not_closed(self, store):
        store.upsert(make(deadline=None))
        assert row(store, "a1")["status"] == "unknown"

    def test_refresh_is_idempotent(self, store):
        store.upsert(make())
        store.refresh_statuses()
        assert store.refresh_statuses() == 0


class TestRunBookkeeping:
    def test_a_run_records_its_counts_and_status(self, store):
        run_group = uuid.uuid4()
        run_id = store.start_run(run_group, SOURCE_KEY)

        stats = RunStats(source_key=SOURCE_KEY, items_found=5, items_created=5, pages_fetched=2)
        store.finish_run(run_id, stats)

        with store.conn.cursor() as cur:
            cur.execute(
                "select status, items_found, items_created, pages_fetched, duration_ms "
                "from scraper_runs where id = %s",
                (run_id,),
            )
            status, found, created, pages, duration = cur.fetchone()

        assert (status, found, created, pages) == ("success", 5, 5, 2)
        assert duration is not None

    def test_a_failed_run_keeps_the_error_for_the_admin_page(self, store):
        run_id = store.start_run(uuid.uuid4(), SOURCE_KEY)
        stats = RunStats(
            source_key=SOURCE_KEY, error_type="LayoutChanged", error_message="no cards found"
        )
        store.finish_run(run_id, stats)

        with store.conn.cursor() as cur:
            cur.execute(
                "select status, error_type, error_message from scraper_runs where id = %s",
                (run_id,),
            )
            assert cur.fetchone() == ("failed", "LayoutChanged", "no cards found")

    def test_warnings_are_kept_so_slow_degradation_is_visible(self, store):
        run_id = store.start_run(uuid.uuid4(), SOURCE_KEY)
        store.finish_run(
            run_id, RunStats(source_key=SOURCE_KEY, items_found=3, warnings=["bad date on X"])
        )

        with store.conn.cursor() as cur:
            cur.execute("select status, warnings from scraper_runs where id = %s", (run_id,))
            status, warnings = cur.fetchone()

        assert status == "partial"
        assert warnings == ["bad date on X"]
