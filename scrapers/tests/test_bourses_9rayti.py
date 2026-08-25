"""9rayti scholarship scraper, against saved HTML.

The deadline tests carry the weight here: this source publishes the
deadline twice and the visible copy is a hard-coded placeholder.
"""

from datetime import date
from pathlib import Path

import pytest
from bs4 import BeautifulSoup

from morocco_scraper.models import OpportunityType
from morocco_scraper.sources.bourses_9rayti import (
    PLACEHOLDER_DEADLINE,
    Bourses9raytiScraper,
    LayoutChanged,
)
from tests.fake_session import FakeSession

FIXTURES = Path(__file__).parent / "fixtures"


def read(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


@pytest.fixture
def listing_html() -> str:
    return read("bourses_9rayti_listing.html")


@pytest.fixture
def detail_html() -> str:
    return read("bourses_9rayti_detail.html")


@pytest.fixture
def session(listing_html, detail_html) -> FakeSession:
    # Host-qualified so the listing key cannot also match a detail URL
    # whose slug happens to begin with "bourses".
    return FakeSession(
        {"9rayti.com/bourses": listing_html, "9rayti.com/bourse/": detail_html}
    )


class TestListing:
    def test_reads_the_results_grid(self, session, listing_html):
        scraper = Bourses9raytiScraper(session, {"pages": 1, "fetch_details": False})
        assert len(scraper._listing_cards(BeautifulSoup(listing_html, "lxml"))) == 10

    def test_ignores_the_navigation_overlay(self, listing_html):
        """The site-wide nav also links to /bourse/ pages; counting those
        would inflate every run with the same handful of announcements."""
        soup = BeautifulSoup(listing_html, "lxml")
        scraper = Bourses9raytiScraper(FakeSession({}), {})

        all_links = soup.select('a[href^="/bourse/"]')
        scoped = scraper._listing_cards(soup)

        assert len(all_links) > len(scoped)

    def test_uses_the_slug_as_a_stable_id(self, session, listing_html):
        scraper = Bourses9raytiScraper(session, {"pages": 1, "fetch_details": False})
        cards = scraper._listing_cards(BeautifulSoup(listing_html, "lxml"))

        opportunity = scraper._parse_card(cards[0])

        assert opportunity.type is OpportunityType.SCHOLARSHIP
        assert "/" not in opportunity.external_id
        assert opportunity.external_id in opportunity.application_link
        assert opportunity.title


class TestDeadline:
    """The one thing this scraper must not get wrong."""

    def test_the_deadline_comes_from_the_countdown_attribute(self, session):
        scraper = Bourses9raytiScraper(session, {"pages": 1, "max_items": 1})

        opportunity = next(iter(scraper.scrape()))

        assert opportunity.deadline is not None
        assert opportunity.deadline.date() == date(2026, 6, 15)

    def test_the_visible_date_is_a_placeholder_and_is_not_used(self, detail_html):
        """Every detail page renders the same date in `.target-date-display`;
        only `data-target-date` varies. Reading the visible one would give
        every scholarship an identical, wrong deadline."""
        soup = BeautifulSoup(detail_html, "lxml")

        displayed = soup.select_one(".target-date-display").get_text(strip=True)
        assert displayed == PLACEHOLDER_DEADLINE

        scraper = Bourses9raytiScraper(FakeSession({}), {})
        parsed = scraper._deadline(soup, "x")

        assert parsed.strftime("%d/%m/%Y") != displayed

    def test_a_missing_countdown_warns_rather_than_guessing(self, detail_html):
        soup = BeautifulSoup(detail_html.replace("data-target-date", "data-x"), "lxml")
        scraper = Bourses9raytiScraper(FakeSession({}), {})

        assert scraper._deadline(soup, "some-slug") is None
        assert scraper.warnings

    def test_an_unparseable_attribute_warns_rather_than_raising(self, detail_html):
        soup = BeautifulSoup(
            detail_html.replace('data-target-date="2026-06-15T00:00:00+00:00"',
                                'data-target-date="soon"'),
            "lxml",
        )
        scraper = Bourses9raytiScraper(FakeSession({}), {})

        assert scraper._deadline(soup, "some-slug") is None
        assert scraper.warnings

    def test_the_deadline_is_timezone_aware(self, session):
        scraper = Bourses9raytiScraper(session, {"pages": 1, "max_items": 1})
        opportunity = next(iter(scraper.scrape()))
        assert opportunity.deadline.tzinfo is not None


class TestDetail:
    def test_pulls_out_the_prose_and_the_sections(self, session):
        scraper = Bourses9raytiScraper(session, {"pages": 1, "max_items": 1})

        opportunity = next(iter(scraper.scrape()))

        assert opportunity.description
        assert opportunity.attributes
        assert opportunity.domains

    def test_conditions_are_separated_from_the_rest(self, session):
        scraper = Bourses9raytiScraper(session, {"pages": 1, "max_items": 1})
        opportunity = next(iter(scraper.scrape()))

        # Whatever landed in conditions must not also sit in attributes.
        if opportunity.conditions_to_apply:
            for heading in opportunity.attributes:
                assert heading not in opportunity.conditions_to_apply.split("\n")[0]

    def test_a_broken_detail_page_keeps_the_listing_data(self, listing_html):
        session = FakeSession(
            {"9rayti.com/bourses": listing_html, "9rayti.com/bourse/": "<html></html>"}
        )
        scraper = Bourses9raytiScraper(session, {"pages": 1, "max_items": 3})

        opportunities = list(scraper.scrape())

        assert opportunities
        assert all(o.title for o in opportunities)
        assert scraper.warnings


class TestFailureHandling:
    def test_a_changed_layout_fails_the_run_loudly(self):
        session = FakeSession({"9rayti.com/bourses": "<html><body>redesign</body></html>"})
        with pytest.raises(LayoutChanged):
            list(Bourses9raytiScraper(session, {"pages": 1}).scrape())

    def test_max_items_stops_early(self, session):
        scraper = Bourses9raytiScraper(session, {"pages": 5, "max_items": 2})
        assert len(list(scraper.scrape())) == 2
