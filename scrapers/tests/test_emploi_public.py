"""Scraper tests run against saved HTML, never the network.

Fixtures are real pages from emploi-public.ma with scripts and styles
stripped. When the site changes layout these tests keep passing while the
live run starts failing -- that is the point: they pin the parsing rules,
and `source_health` catches the drift.
"""

from datetime import date
from pathlib import Path

import pytest
from bs4 import BeautifulSoup

from morocco_scraper.models import EducationLevel, OpportunityType
from morocco_scraper.sources.emploi_public import (
    EmploiPublicScraper,
    LayoutChanged,
    _infer_education_level,
)

FIXTURES = Path(__file__).parent / "fixtures"


class FakeSession:
    """Serves fixtures instead of making requests."""

    def __init__(self, pages: dict[str, str]):
        self.pages = pages
        self.requested: list[str] = []
        self.pages_fetched = 0

    def get_text(self, url: str) -> str:
        self.requested.append(url)
        for fragment, body in self.pages.items():
            if fragment in url:
                self.pages_fetched += 1
                return body
        raise AssertionError(f"unexpected request: {url}")

    def close(self) -> None:
        pass


def read(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


@pytest.fixture
def listing_html() -> str:
    return read("emploi_public_listing.html")


@pytest.fixture
def detail_html() -> str:
    return read("emploi_public_detail.html")


@pytest.fixture
def scraper(listing_html, detail_html) -> EmploiPublicScraper:
    session = FakeSession({"concours-liste": listing_html, "concours/details": detail_html})
    return EmploiPublicScraper(session, {"pages": 1, "fetch_details": False})


class TestListingParsing:
    def test_reads_every_card_in_the_result_list(self, scraper, listing_html):
        cards = scraper._listing_cards(BeautifulSoup(listing_html, "lxml"))
        assert len(cards) == 9

    def test_ignores_the_promotional_carousel_below_the_results(self, listing_html):
        soup = BeautifulSoup(listing_html, "lxml")
        # The "Dernière chance pour postuler" block links to detail pages too;
        # counting them all would double up listings.
        all_detail_links = soup.select('a[href*="/concours/details/"]')
        scoped = EmploiPublicScraper(FakeSession({}), {})._listing_cards(soup)
        assert len(all_detail_links) > len(scoped)

    def test_extracts_the_fields_the_card_exposes(self, scraper, listing_html):
        card = scraper._listing_cards(BeautifulSoup(listing_html, "lxml"))[0]
        opportunity = scraper._parse_card(card)

        assert opportunity.external_id == "7babf89f-94cb-4f16-8e62-84adf1859961"
        assert opportunity.type is OpportunityType.CONCOURS
        assert opportunity.title.startswith("Avis de concours de recrutement")
        assert "Ministère de la Jeunesse" in opportunity.institution
        assert opportunity.deadline.date() == date(2026, 8, 28)
        assert opportunity.deadline.hour == 16
        assert opportunity.event_date == date(2026, 9, 13)
        assert opportunity.positions_available == 1
        assert opportunity.application_link.startswith("https://www.emploi-public.ma/")
        assert opportunity.domains

    def test_skips_follow_up_notices_that_cannot_be_applied_to(self, scraper, listing_html):
        cards = scraper._listing_cards(BeautifulSoup(listing_html, "lxml"))
        parsed = [scraper._parse_card(c) for c in cards]

        assert any(p is None for p in parsed), "fixture should contain a Convocation"
        stages = {p.attributes.get("Étape") for p in parsed if p}
        assert stages == {"Annonce"}

    def test_follow_up_notices_are_kept_when_asked_for(self, scraper, listing_html):
        cards = scraper._listing_cards(BeautifulSoup(listing_html, "lxml"))
        parsed = [scraper._parse_card(c, include_all_stages=True) for c in cards]
        assert all(p is not None for p in parsed)
        assert "Convocation" in {p.attributes.get("Étape") for p in parsed}

    def test_detects_a_further_page(self, scraper, listing_html):
        soup = BeautifulSoup(listing_html, "lxml")
        assert scraper._has_next_page(soup, 1) is True
        assert scraper._has_next_page(soup, 999) is False


class TestDetailEnrichment:
    def test_fills_in_eligibility_dates_and_description(self, listing_html, detail_html):
        session = FakeSession({"concours-liste": listing_html, "concours/details": detail_html})
        scraper = EmploiPublicScraper(session, {"pages": 1})

        opportunity = next(iter(scraper.scrape()))

        assert opportunity.published_at == date(2026, 8, 13)
        assert opportunity.required_education_level is EducationLevel.MASTER
        assert "Audit et Contrôle de Gestion" in opportunity.conditions_to_apply
        assert opportunity.attributes["Code du concours"] == "C43263/26"
        assert opportunity.attributes["Étape"] == "Annonce"
        assert "economics-finance" in opportunity.domains
        assert opportunity.description

    def test_a_broken_detail_page_downgrades_to_listing_data(self, listing_html):
        session = FakeSession({"concours-liste": listing_html, "concours/details": "<html></html>"})
        scraper = EmploiPublicScraper(session, {"pages": 1})

        opportunities = list(scraper.scrape())

        # Still usable, and the problem is reported rather than swallowed.
        assert opportunities
        assert all(o.title and o.deadline for o in opportunities)
        assert scraper.warnings

    def test_redacted_values_are_dropped(self, detail_html):
        scraper = EmploiPublicScraper(FakeSession({}), {})
        fields = scraper._labelled_values(
            BeautifulSoup(detail_html.replace("Audit et Contrôle de Gestion", "****"), "lxml")
        )
        assert "Spécialité" not in fields


class TestFailureHandling:
    def test_a_changed_layout_fails_the_run_loudly(self):
        session = FakeSession({"concours-liste": "<html><body>redesign</body></html>"})
        scraper = EmploiPublicScraper(session, {"pages": 1})

        with pytest.raises(LayoutChanged):
            list(scraper.scrape())

    def test_max_items_stops_early(self, listing_html, detail_html):
        session = FakeSession({"concours-liste": listing_html, "concours/details": detail_html})
        scraper = EmploiPublicScraper(session, {"pages": 5, "max_items": 2})
        assert len(list(scraper.scrape())) == 2


@pytest.mark.parametrize(
    "text,expected",
    [
        ("Ingénieur d'État - echelle 11", EducationLevel.MASTER),
        ("Technicien de 3ème grade - echelle 9", EducationLevel.BAC_PLUS_2),
        ("Professeur de l'enseignement supérieur", EducationLevel.DOCTORAT),
        ("Adjoint technique - echelle 6", EducationLevel.BAC),
        ("Quelque chose d'inconnu", None),
    ],
)
def test_infers_education_level_from_the_grade(text, expected):
    assert _infer_education_level(text) is expected
