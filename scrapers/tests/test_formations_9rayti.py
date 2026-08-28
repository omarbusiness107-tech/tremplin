"""Programme-directory scraper, against compact saved HTML fixtures."""

from pathlib import Path

import pytest
from bs4 import BeautifulSoup

from morocco_scraper.models import EducationLevel, OpportunityType
from morocco_scraper.sources.formations_9rayti import Formations9raytiScraper, LayoutChanged
from tests.fake_session import FakeSession

FIXTURES = Path(__file__).parent / "fixtures"


def read(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


@pytest.fixture
def session() -> FakeSession:
    return FakeSession(
        {
            "type-formation/bachelor": read("formations_9rayti_bachelor_listing.html"),
            "type-formation/master": read("formations_9rayti_master_listing.html"),
            "type-formation/doctorat": read("formations_9rayti_doctorat_listing.html"),
            "/formation/": read("formations_9rayti_detail.html"),
        }
    )


def test_reads_all_three_study_cycles(session):
    opportunities = list(Formations9raytiScraper(session, {"pages": 1}).scrape())

    assert {opportunity.type for opportunity in opportunities} == {
        OpportunityType.BACHELOR,
        OpportunityType.MASTER,
        OpportunityType.DOCTORAT,
    }
    assert all(opportunity.deadline is None for opportunity in opportunities)
    assert all(opportunity.institution for opportunity in opportunities)
    assert all(opportunity.description for opportunity in opportunities)


def test_enriches_programmes_with_school_and_full_details(session):
    opportunities = list(Formations9raytiScraper(session, {"pages": 1}).scrape())
    opportunity = opportunities[0]

    assert opportunity.institution == "Université Exemple de Rabat"
    assert opportunity.location_city == "Rabat"
    assert opportunity.description and "apprentissage par projets" in opportunity.description
    assert opportunity.conditions_to_apply and "Étude du dossier" in opportunity.conditions_to_apply
    assert opportunity.attributes["Secteurs de formation"] == "Informatique - Management"
    assert "Objectifs de la formation" in opportunity.attributes
    assert "• Construire des produits numériques" in opportunity.attributes["Objectifs de la formation"]
    assert {"software-it", "management-business"}.issubset(opportunity.domains)


def test_city_can_be_read_from_a_school_url_when_the_name_omits_it(session):
    scraper = Formations9raytiScraper(session, {})

    assert scraper._city_from_school("FS", "/ecole/fsa-agadir") == "Agadir"


def test_title_wins_when_a_directory_contains_a_different_cycle(session):
    opportunities = list(Formations9raytiScraper(session, {"pages": 1}).scrape())
    by_id = {opportunity.external_id: opportunity for opportunity in opportunities}

    assert by_id["licence-medecine"].type is OpportunityType.BACHELOR
    assert by_id["licence-medecine"].required_education_level is EducationLevel.BAC
    assert by_id["licence-et-master-management"].type is OpportunityType.MASTER


def test_only_the_results_grid_is_parsed(session):
    scraper = Formations9raytiScraper(session, {})
    soup = BeautifulSoup(
        '<a href="/formation/navigation">navigation</a>' + read("formations_9rayti_bachelor_listing.html"),
        "lxml",
    )
    assert len(scraper._listing_cards(soup)) == 2


def test_a_changed_category_layout_fails_loudly():
    session = FakeSession({"type-formation/bachelor": "<html><body>redesign</body></html>"})
    with pytest.raises(LayoutChanged):
        list(Formations9raytiScraper(session, {"pages": 1}).scrape())


def test_max_items_stops_across_categories(session):
    opportunities = list(Formations9raytiScraper(session, {"pages": 1, "max_items": 3}).scrape())
    assert len(opportunities) == 3
