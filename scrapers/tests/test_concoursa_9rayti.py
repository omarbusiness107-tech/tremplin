"""concoursa_9rayti scraper, against saved HTML.

Shares its template with bourses_9rayti (both are `NineRaytiScraper`
leaves), so `test_bourses_9rayti.py` is where the deadline-placeholder
trap and the article-body fallback are pinned in depth. This file covers
what is specific to the concours section: Arabic content flowing through
cleanly, the acronym classifier, and a listing with no countdown at all
(open-access registration windows publish no deadline).
"""

from datetime import date
from pathlib import Path

import pytest
from bs4 import BeautifulSoup

from morocco_scraper.models import OpportunityType
from morocco_scraper.sources._nine_rayti import PLACEHOLDER_DEADLINE
from morocco_scraper.sources.concoursa_9rayti import ConcoursA9raytiScraper, LayoutChanged
from tests.fake_session import FakeSession

FIXTURES = Path(__file__).parent / "fixtures"


def read(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


@pytest.fixture
def listing_html() -> str:
    return read("concoursa_9rayti_listing.html")


@pytest.fixture
def detail_html() -> str:
    """An Arabic announcement with conditions, sections, and a real deadline."""
    return read("concoursa_9rayti_detail.html")


@pytest.fixture
def session(listing_html, detail_html) -> FakeSession:
    return FakeSession(
        {"9rayti.com/concoursa": listing_html, "9rayti.com/concoursa/": detail_html}
    )


class TestListing:
    def test_reads_the_results_grid(self, session, listing_html):
        scraper = ConcoursA9raytiScraper(session, {"pages": 1, "fetch_details": False})
        assert len(scraper._listing_cards(BeautifulSoup(listing_html, "lxml"))) == 10

    def test_ignores_the_navigation_overlay(self, listing_html):
        soup = BeautifulSoup(listing_html, "lxml")
        scraper = ConcoursA9raytiScraper(FakeSession({}), {})

        all_links = soup.select('a[href^="/concoursa/"]')
        scoped = scraper._listing_cards(soup)

        assert len(all_links) > len(scoped)

    def test_reads_arabic_titles_without_mangling_them(self, session, listing_html):
        scraper = ConcoursA9raytiScraper(session, {"pages": 1, "fetch_details": False})
        cards = scraper._listing_cards(BeautifulSoup(listing_html, "lxml"))

        opportunities = [scraper._parse_card(c) for c in cards]
        arabic_titled = [o for o in opportunities if o and any("؀" <= ch <= "ۿ" for ch in o.title)]

        assert arabic_titled, "fixture should contain at least one Arabic title"
        for o in arabic_titled:
            assert o.type is OpportunityType.CONCOURS
            assert o.external_id  # slug, in Latin script, even for an Arabic title


class TestDeadline:
    """Shares the trap with bourses_9rayti -- same site, same template."""

    def test_the_deadline_comes_from_the_countdown_attribute(self, session):
        scraper = ConcoursA9raytiScraper(session, {"pages": 1, "max_items": 1})
        opportunity = next(iter(scraper.scrape()))

        assert opportunity.deadline is not None
        assert opportunity.deadline.strftime("%d/%m/%Y") != PLACEHOLDER_DEADLINE

    def test_a_registration_window_with_no_countdown_gets_no_deadline(self, listing_html):
        """Open-access university registration windows publish no cut-off
        date at all -- unlike the bourses fixtures, this is a real,
        expected `None`, not a parsing failure, though it still warns."""
        no_countdown = read("concoursa_9rayti_detail_no_countdown.html")
        session = FakeSession(
            {"9rayti.com/concoursa": listing_html, "9rayti.com/concoursa/": no_countdown}
        )
        scraper = ConcoursA9raytiScraper(session, {"pages": 1, "max_items": 1})

        opportunity = next(iter(scraper.scrape()))

        assert opportunity.deadline is None
        assert scraper.warnings

    def test_a_page_announcing_results_still_carries_its_original_deadline(self, listing_html):
        """Once results are published the countdown has already expired,
        but the attribute is still real data, not the placeholder."""
        results = read("concoursa_9rayti_detail_results.html")
        session = FakeSession(
            {"9rayti.com/concoursa": listing_html, "9rayti.com/concoursa/": results}
        )
        scraper = ConcoursA9raytiScraper(session, {"pages": 1, "max_items": 1})

        opportunity = next(iter(scraper.scrape()))

        assert opportunity.deadline is not None
        assert opportunity.deadline.date() < date(2026, 8, 24)  # session's "today"


class TestDetail:
    def test_pulls_out_arabic_conditions_separately_from_the_rest(self, session):
        scraper = ConcoursA9raytiScraper(session, {"pages": 1, "max_items": 1})
        opportunity = next(iter(scraper.scrape()))

        assert opportunity.description
        assert opportunity.conditions_to_apply
        assert "شروط الترشيح" in opportunity.conditions_to_apply  # "conditions of candidacy"
        assert opportunity.attributes

    def test_a_broken_detail_page_keeps_the_listing_data(self, listing_html):
        session = FakeSession(
            {"9rayti.com/concoursa": listing_html, "9rayti.com/concoursa/": "<html></html>"}
        )
        scraper = ConcoursA9raytiScraper(session, {"pages": 1, "max_items": 3})

        opportunities = list(scraper.scrape())

        assert opportunities
        assert all(o.title for o in opportunities)
        assert scraper.warnings


class TestClassification:
    def test_an_institution_acronym_drives_the_domain_when_the_prose_does_not(self, session):
        scraper = ConcoursA9raytiScraper(session, {"pages": 1, "max_items": 1})
        opportunity = next(iter(scraper.scrape()))
        assert opportunity.domains != ["other"]


class TestFailureHandling:
    def test_a_changed_layout_fails_the_run_loudly(self):
        session = FakeSession({"9rayti.com/concoursa": "<html><body>redesign</body></html>"})
        with pytest.raises(LayoutChanged):
            list(ConcoursA9raytiScraper(session, {"pages": 1}).scrape())

    def test_max_items_stops_early(self, session):
        scraper = ConcoursA9raytiScraper(session, {"pages": 5, "max_items": 2})
        assert len(list(scraper.scrape())) == 2
