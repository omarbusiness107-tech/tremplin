"""Shared community feeds and Orientation Chabab normalization."""

from datetime import date
from pathlib import Path

from morocco_scraper.models import EducationLevel, OpportunityType
from morocco_scraper.registry import load_all
from morocco_scraper.sources.community_blogger import (
    AlMasterMarocScraper,
    JadidConcoursScraper,
)
from morocco_scraper.sources.orientation_chabab import OrientationChababScraper
from tests.fake_session import FakeSession


FIXTURES = Path(__file__).parent / "fixtures"


def read(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def test_blogger_feed_extracts_a_complete_master_and_skips_results():
    session = FakeSession({"/feeds/posts/default": read("community_blogger_feed.json")})

    opportunities = list(AlMasterMarocScraper(session, {"pages": 1}).scrape())

    assert len(opportunities) == 1
    opportunity = opportunities[0]
    assert opportunity.type is OpportunityType.MASTER
    assert opportunity.required_education_level is EducationLevel.LICENCE
    assert opportunity.institution == "FEG Agadir"
    assert opportunity.location_city == "Agadir"
    assert opportunity.deadline and opportunity.deadline.date() == date(2026, 9, 10)
    assert opportunity.published_at == date(2026, 8, 28)
    assert opportunity.application_link == "https://candidature.uiz.ac.ma/master"
    assert opportunity.conditions_to_apply and "Licence en économie" in opportunity.conditions_to_apply
    assert opportunity.description and "Master Finance et Audit" in opportunity.description


def test_mixed_feed_classifies_jobs_from_the_title():
    scraper = JadidConcoursScraper(FakeSession({}), {})
    entry = {
        "title": {"$t": "Attijariwafa bank recrute à Casablanca"},
        "published": {"$t": "2026-08-28T08:00:00+01:00"},
        "category": [{"term": "Alwadifa"}],
        "link": [
            {
                "rel": "alternate",
                "href": "https://www.jadid-concours.com/2026/08/attijariwafa-recrute.html",
            }
        ],
        "content": {"$t": "<p>Plusieurs profils sont recherchés.</p>"},
    }

    opportunity = scraper._parse_entry(entry)

    assert opportunity is not None
    assert opportunity.type is OpportunityType.JOB
    assert opportunity.institution == "Attijariwafa bank"
    assert opportunity.location_city == "Casablanca"


def test_orientation_feed_enriches_from_the_article():
    session = FakeSession(
        {
            "/feed/": read("orientation_chabab_feed.xml"),
            "/master/": read("orientation_chabab_detail.html"),
        }
    )

    opportunities = list(OrientationChababScraper(session, {}).scrape())

    assert len(opportunities) == 1
    opportunity = opportunities[0]
    assert opportunity.type is OpportunityType.MASTER
    assert opportunity.institution == "FEG El Jadida"
    assert opportunity.location_city == "El Jadida"
    assert opportunity.deadline and opportunity.deadline.date() == date(2026, 9, 10)
    assert opportunity.application_link == "https://e-candidature.ucd.ac.ma/Master/register"
    assert opportunity.conditions_to_apply and "licence compatible" in opportunity.conditions_to_apply


def test_all_requested_sources_are_registered():
    expected = {
        "almaster_maroc",
        "cycle_ingenieur_maroc",
        "jadid_concours",
        "alwadifa_mag",
        "concours24",
        "orientation_chabab",
        "mostajadat_alwadifa",
        "bourses_etudes",
        "licence_professionnelle_maroc",
    }

    assert expected.issubset(load_all())
