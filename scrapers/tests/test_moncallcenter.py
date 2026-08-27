"""MonCallCenter scraper, against saved HTML."""

from datetime import date
from pathlib import Path

import pytest
from bs4 import BeautifulSoup

from morocco_scraper.models import OpportunityType
from morocco_scraper.sources.moncallcenter import LayoutChanged, MonCallCenterScraper
from tests.fake_session import FakeSession

FIXTURES = Path(__file__).parent / "fixtures"


def read(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


@pytest.fixture
def listing_html() -> str:
    return read("moncallcenter_listing.html")


@pytest.fixture
def detail_html() -> str:
    return read("moncallcenter_detail.html")


@pytest.fixture
def session(listing_html, detail_html) -> FakeSession:
    return FakeSession({"offres-emploi": listing_html, "offre-emploi/": detail_html})


class TestListing:
    def test_reads_the_offer_cards(self, session, listing_html):
        scraper = MonCallCenterScraper(session, {"pages": 1, "fetch_details": False})
        assert len(scraper._listing_cards(BeautifulSoup(listing_html, "lxml"))) > 5

    def test_extracts_what_the_card_carries(self, session, listing_html):
        scraper = MonCallCenterScraper(session, {"pages": 1, "fetch_details": False})
        cards = scraper._listing_cards(BeautifulSoup(listing_html, "lxml"))

        opportunity = next(
            o for o in (scraper._parse_card(c) for c in cards) if o and o.location_city
        )

        assert opportunity.type is OpportunityType.JOB
        assert opportunity.external_id.isdigit()
        assert opportunity.application_link.startswith("https://www.moncallcenter.ma/")
        assert opportunity.title

    def test_a_job_advert_has_no_deadline(self, session, listing_html):
        """These run until filled. `unknown`, not `closed` — the status
        trigger depends on the difference."""
        scraper = MonCallCenterScraper(session, {"pages": 1, "fetch_details": False})
        cards = scraper._listing_cards(BeautifulSoup(listing_html, "lxml"))

        assert all(o.deadline is None for o in (scraper._parse_card(c) for c in cards) if o)

    @pytest.mark.parametrize("title", ["Stage PFE — Marketing digital", "Stagiaire RH", "Internship Data"])
    def test_internship_titles_use_the_internship_filter(self, title):
        scraper = MonCallCenterScraper(FakeSession({}), {})
        card = BeautifulSoup(
            f'<div class="offres"><h2><a href="/offre-emploi/acme-{123456}">{title}</a></h2></div>',
            "lxml",
        ).div

        opportunity = scraper._parse_card(card)

        assert opportunity.type is OpportunityType.INTERNSHIP

    def test_the_country_is_not_stored_as_a_city(self, session, listing_html):
        """The board writes "Maroc" for a nationwide posting."""
        scraper = MonCallCenterScraper(session, {"pages": 1, "fetch_details": False})
        cards = scraper._listing_cards(BeautifulSoup(listing_html, "lxml"))

        cities = {o.location_city for o in (scraper._parse_card(c) for c in cards) if o}
        assert "Maroc" not in cities

    def test_work_from_home_listings_are_marked_remote(self, session, listing_html):
        scraper = MonCallCenterScraper(session, {"pages": 1, "fetch_details": False})
        cards = scraper._listing_cards(BeautifulSoup(listing_html, "lxml"))

        parsed = [o for o in (scraper._parse_card(c) for c in cards) if o]
        remote = [o for o in parsed if o.is_remote]
        assert remote, "fixture should contain a 'travail a domicile' listing"
        assert all("domicile" in o.attributes["Activité"].lower() for o in remote)

    def test_a_sponsored_repeat_shares_its_id_with_the_normal_listing(
        self, session, listing_html
    ):
        """Sponsored offers appear twice on the page. They must carry the
        same external_id so the store collapses them instead of creating a
        duplicate row."""
        scraper = MonCallCenterScraper(session, {"pages": 1, "fetch_details": False})
        cards = scraper._listing_cards(BeautifulSoup(listing_html, "lxml"))

        parsed = [o for o in (scraper._parse_card(c) for c in cards) if o]
        ids = [o.external_id for o in parsed]

        assert len(ids) > len(set(ids)), "fixture should contain a sponsored repeat"
        for duplicated in {i for i in ids if ids.count(i) > 1}:
            same = [o for o in parsed if o.external_id == duplicated]
            assert len({o.application_link for o in same}) == 1


class TestDetail:
    def test_fills_in_employer_languages_and_sections(self, session):
        scraper = MonCallCenterScraper(session, {"pages": 1, "max_items": 1})

        opportunity = next(iter(scraper.scrape()))

        assert opportunity.institution
        assert "Français" in opportunity.languages_required
        assert opportunity.description
        assert opportunity.conditions_to_apply
        assert "Salaire Net + primes" in opportunity.attributes

    def test_the_employer_logo_comes_from_the_detail_page(self, session):
        """The listing card's <img alt> names a different company from the
        one its link points at, so the logo has to come from the detail
        page, where the alt matches the employer heading."""
        scraper = MonCallCenterScraper(session, {"pages": 1, "max_items": 1})

        opportunity = next(iter(scraper.scrape()))

        assert opportunity.institution
        assert opportunity.institution_logo_url
        assert opportunity.institution_logo_url.startswith("https://www.moncallcenter.ma/")

    def test_the_sites_own_branding_is_not_mistaken_for_a_logo(self, session):
        """moncallcenter.ma's own header logo is on every page; only an
        alt matching the employer counts."""
        scraper = MonCallCenterScraper(session, {"pages": 1, "max_items": 1})
        opportunity = next(iter(scraper.scrape()))
        assert "logoo.png" not in (opportunity.institution_logo_url or "")

    def test_a_broken_detail_page_keeps_the_listing_data(self, listing_html):
        session = FakeSession({"offres-emploi": listing_html, "offre-emploi/": "<html></html>"})
        scraper = MonCallCenterScraper(session, {"pages": 1, "max_items": 3})

        opportunities = list(scraper.scrape())

        assert opportunities
        assert all(o.title for o in opportunities)
        assert scraper.warnings


class TestFailureHandling:
    def test_a_changed_layout_fails_the_run_loudly(self):
        session = FakeSession({"offres-emploi": "<html><body>redesign</body></html>"})
        with pytest.raises(LayoutChanged):
            list(MonCallCenterScraper(session, {"pages": 1}).scrape())

    def test_max_items_stops_early(self, session):
        scraper = MonCallCenterScraper(session, {"pages": 5, "max_items": 2})
        assert len(list(scraper.scrape())) == 2
