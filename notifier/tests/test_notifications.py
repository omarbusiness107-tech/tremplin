"""Selection and de-duplication, against a real Postgres.

These are assertions about SQL — the unique constraint, the cooldown, the
claim-before-send ordering — so they need a real database with the
migrations applied.

    TEST_DATABASE_URL=postgresql://.../tracker_test pytest tests/test_notifications.py
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from morocco_notifier import queries
from morocco_notifier.email import EmailError
from morocco_notifier.runner import run

TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL, reason="set TEST_DATABASE_URL to run notification tests"
)

SOURCE_KEY = "test_notify_source"
SITE = "https://example.ma"


class FakeMailer:
    def __init__(self, fail: bool = False):
        self.fail = fail
        self.sent: list[dict] = []

    def send(self, *, to, subject, html, text):
        if self.fail:
            raise EmailError("provider unavailable")
        self.sent.append({"to": to, "subject": subject})
        return "msg-1"


@pytest.fixture
def conn():
    import psycopg

    connection = psycopg.connect(TEST_DATABASE_URL, autocommit=False)
    _clean(connection)
    with connection.cursor() as cur:
        cur.execute(
            "insert into public.sources (key, name, homepage_url) values (%s, %s, %s) "
            "on conflict (key) do nothing",
            (SOURCE_KEY, "Test", "https://example.test"),
        )
    connection.commit()
    try:
        yield connection
    finally:
        connection.rollback()
        _clean(connection)
        with connection.cursor() as cur:
            cur.execute("delete from public.sources where key = %s", (SOURCE_KEY,))
        connection.commit()
        connection.close()


def _clean(connection) -> None:
    with connection.cursor() as cur:
        cur.execute(
            "delete from public.opportunities where source_key = %s", (SOURCE_KEY,)
        )
        cur.execute("delete from auth.users where email like 'notify-test-%%'")
    connection.commit()


def make_user(conn, *, alerts: bool = True, reminder_days: int = 3, **prefs) -> str:
    with conn.cursor() as cur:
        cur.execute(
            "insert into auth.users (email, raw_user_meta_data) values (%s, %s::jsonb) returning id",
            (f"notify-test-{uuid.uuid4().hex[:8]}@example.com", '{"full_name":"Test User"}'),
        )
        user_id = cur.fetchone()[0]
        cur.execute(
            """
            update public.user_preferences set
                email_alerts_enabled = %s,
                deadline_reminder_days = %s,
                target_types = %s::opportunity_type[],
                fields_of_interest = %s,
                education_level = %s::education_level
            where user_id = %s
            """,
            (
                alerts,
                reminder_days,
                prefs.get("target_types", ["concours"]),
                prefs.get("fields_of_interest", ["law"]),
                prefs.get("education_level"),
                user_id,
            ),
        )
    return user_id


def make_opportunity(conn, *, days_until: int | None = 20, discovered_hours_ago: int = 1,
                     opportunity_type: str = "concours", domains=("law",),
                     education: str | None = None) -> str:
    deadline = (
        datetime.now(timezone.utc) + timedelta(days=days_until)
        if days_until is not None
        else None
    )
    key = uuid.uuid4().hex
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into public.opportunities (
                source_key, external_id, fingerprint, content_hash, title, type,
                institution, domains, application_link, deadline,
                required_education_level, discovered_at
            ) values (
                %s, %s, %s, %s, 'Test opportunity', %s::opportunity_type,
                'Test Institution', %s, 'https://example.test/x', %s,
                %s::education_level, now() - make_interval(hours => %s)
            ) returning id
            """,
            (SOURCE_KEY, key, key, key, opportunity_type, list(domains), deadline,
             education, discovered_hours_ago),
        )
        return cur.fetchone()[0]


def bookmark(conn, user_id: str, opportunity_id: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "insert into public.bookmarks (user_id, opportunity_id) values (%s, %s)",
            (user_id, opportunity_id),
        )


class TestNewMatchSelection:
    def test_a_matching_new_listing_is_selected(self, conn):
        make_user(conn)
        make_opportunity(conn)
        assert len(queries.find_new_matches(conn)) == 1

    def test_everything_for_one_person_arrives_as_one_digest(self, conn):
        make_user(conn)
        for _ in range(3):
            make_opportunity(conn)

        digests = queries.find_new_matches(conn)

        assert len(digests) == 1
        assert len(digests[0].opportunities) == 3

    def test_someone_who_turned_alerts_off_is_not_selected(self, conn):
        make_user(conn, alerts=False)
        make_opportunity(conn)
        assert queries.find_new_matches(conn) == []

    def test_an_older_listing_is_outside_the_window(self, conn):
        make_user(conn)
        make_opportunity(conn, discovered_hours_ago=200)
        assert queries.find_new_matches(conn) == []

    def test_an_unrelated_listing_is_not_selected(self, conn):
        make_user(conn, target_types=["master"], fields_of_interest=["agriculture"])
        make_opportunity(conn, opportunity_type="concours", domains=["law"])
        assert queries.find_new_matches(conn) == []

    def test_nobody_is_emailed_about_something_they_cannot_apply_for(self, conn):
        """A licence holder should not be alerted to a doctorate-only call."""
        make_user(conn, education_level="licence")
        make_opportunity(conn, education="doctorat")
        assert queries.find_new_matches(conn) == []

    def test_a_closed_listing_is_never_announced(self, conn):
        make_user(conn)
        make_opportunity(conn, days_until=-2)
        assert queries.find_new_matches(conn) == []


class TestDeadlineReminders:
    def test_a_bookmark_closing_inside_the_window_is_selected(self, conn):
        user_id = make_user(conn, reminder_days=5)
        opportunity_id = make_opportunity(conn, days_until=3)
        bookmark(conn, user_id, opportunity_id)

        assert len(queries.find_deadline_reminders(conn)) == 1

    def test_a_bookmark_closing_later_is_left_alone(self, conn):
        user_id = make_user(conn, reminder_days=3)
        opportunity_id = make_opportunity(conn, days_until=20)
        bookmark(conn, user_id, opportunity_id)

        assert queries.find_deadline_reminders(conn) == []

    def test_zero_reminder_days_means_opted_out(self, conn):
        user_id = make_user(conn, reminder_days=0)
        opportunity_id = make_opportunity(conn, days_until=1)
        bookmark(conn, user_id, opportunity_id)

        assert queries.find_deadline_reminders(conn) == []

    def test_an_unsaved_opportunity_never_produces_a_reminder(self, conn):
        make_user(conn, reminder_days=5)
        make_opportunity(conn, days_until=2)
        assert queries.find_deadline_reminders(conn) == []


class TestDeduplication:
    def test_the_same_opportunity_is_never_emailed_twice(self, conn):
        make_user(conn)
        make_opportunity(conn)
        mailer = FakeMailer()

        first = run(conn, mailer, kind="new_match", site_url=SITE, max_emails=10)
        second = run(conn, mailer, kind="new_match", site_url=SITE, max_emails=10)

        assert first.emails_sent == 1
        assert second.emails_sent == 0
        assert len(mailer.sent) == 1

    def test_a_second_new_listing_does_produce_a_second_email(self, conn):
        make_user(conn)
        make_opportunity(conn)
        mailer = FakeMailer()
        run(conn, mailer, kind="new_match", site_url=SITE, max_emails=10)

        make_opportunity(conn)
        again = run(conn, mailer, kind="new_match", site_url=SITE, max_emails=10)

        assert again.emails_sent == 1
        assert again.opportunities_notified == 1

    def test_a_failed_send_is_recorded_and_not_counted_as_sent(self, conn):
        make_user(conn)
        make_opportunity(conn)

        stats = run(conn, FakeMailer(fail=True), kind="new_match", site_url=SITE, max_emails=10)

        assert (stats.emails_sent, stats.emails_failed) == (0, 1)
        with conn.cursor() as cur:
            cur.execute("select sent_at, error from public.notifications")
            sent_at, error = cur.fetchone()
        assert sent_at is None
        assert "provider unavailable" in error

    def test_a_failed_send_is_retried_after_the_cooldown(self, conn):
        make_user(conn)
        make_opportunity(conn)
        run(conn, FakeMailer(fail=True), kind="new_match", site_url=SITE, max_emails=10)

        # Pretend the failure was yesterday.
        with conn.cursor() as cur:
            cur.execute(
                "update public.notifications set created_at = now() - interval '2 days'"
            )

        mailer = FakeMailer()
        retry = run(conn, mailer, kind="new_match", site_url=SITE, max_emails=10)

        assert retry.emails_sent == 1
        assert len(mailer.sent) == 1

    def test_a_failure_is_not_retried_immediately(self, conn):
        make_user(conn)
        make_opportunity(conn)
        run(conn, FakeMailer(fail=True), kind="new_match", site_url=SITE, max_emails=10)

        straight_away = run(conn, FakeMailer(), kind="new_match", site_url=SITE, max_emails=10)

        assert straight_away.emails_sent == 0

    def test_the_per_run_cap_is_honoured(self, conn):
        for _ in range(3):
            make_user(conn)
        make_opportunity(conn)

        stats = run(conn, FakeMailer(), kind="new_match", site_url=SITE, max_emails=2)

        assert stats.emails_sent == 2
