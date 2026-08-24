"""Rendering is pure, so it is tested without a database or a network."""

from datetime import datetime, timedelta, timezone

import pytest

from morocco_notifier.models import Digest, OpportunityBrief
from morocco_notifier.render import html_body, subject, text_body

SITE = "https://example.ma"


def brief(days_left: int | None = 5, **overrides) -> OpportunityBrief:
    deadline = (
        datetime.now(timezone.utc) + timedelta(days=days_left, hours=1)
        if days_left is not None
        else None
    )
    return OpportunityBrief(
        **{
            "id": "11111111-1111-1111-1111-111111111111",
            "title": "Concours de recrutement d'un Ingénieur d'État",
            "type": "concours",
            "institution": "Ministère de l'Intérieur",
            "deadline": deadline,
            "location_city": None,
            "domains": ["software-it"],
            **overrides,
        }
    )


def digest(kind: str = "new_match", count: int = 1, **overrides) -> Digest:
    return Digest(
        **{
            "user_id": "u1",
            "email": "someone@example.com",
            "full_name": "Omar Benali",
            "kind": kind,
            "opportunities": [brief(id=f"id-{i}") for i in range(count)],
            **overrides,
        }
    )


class TestSubject:
    def test_a_single_new_match_names_it(self):
        assert subject(digest()).startswith("New: Concours de recrutement")

    def test_several_matches_are_counted_not_listed(self):
        assert subject(digest(count=4)) == "4 new opportunities match your profile"

    def test_a_reminder_says_how_long_is_left(self):
        d = digest("deadline_reminder")
        d.opportunities = [brief(days_left=2)]
        assert "closes in 2 days" in subject(d)

    def test_closing_today_does_not_say_zero_days(self):
        d = digest("deadline_reminder")
        d.opportunities = [brief(days_left=0)]
        assert "closes today" in subject(d)

    def test_a_long_title_is_truncated(self):
        d = digest()
        d.opportunities = [brief(title="X" * 200)]
        assert len(subject(d)) < 100


class TestBodies:
    def test_text_body_carries_a_link_per_opportunity(self):
        body = text_body(digest(count=3), SITE)
        assert body.count(f"{SITE}/opportunities/") == 3

    def test_the_greeting_uses_a_first_name_when_known(self):
        assert text_body(digest(), SITE).startswith("Hi Omar,")

    def test_a_missing_name_still_greets(self):
        assert text_body(digest(full_name=None), SITE).startswith("Hi,")

    def test_every_email_offers_a_way_out(self):
        for kind in ("new_match", "deadline_reminder"):
            assert "/profile" in text_body(digest(kind), SITE)
            assert "/profile" in html_body(digest(kind), SITE)

    def test_html_escapes_titles(self):
        """Titles come from scraped pages, so they are untrusted input."""
        d = digest()
        d.opportunities = [brief(title="<script>alert(1)</script>", institution="A & B")]
        rendered = html_body(d, SITE)
        assert "<script>alert(1)</script>" not in rendered
        assert "&lt;script&gt;" in rendered
        assert "A &amp; B" in rendered

    @pytest.mark.parametrize(
        "days,expected",
        [(0, "Closes today"), (1, "Closes tomorrow"), (9, "Closes in 9 days")],
    )
    def test_deadline_phrasing(self, days, expected):
        d = digest()
        d.opportunities = [brief(days_left=days)]
        assert expected in text_body(d, SITE)

    def test_a_rolling_opportunity_is_not_described_as_closing(self):
        d = digest()
        d.opportunities = [brief(days_left=None)]
        assert "Rolling" in text_body(d, SITE)
