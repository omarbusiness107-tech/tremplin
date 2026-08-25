"""Normalization is where most scraper bugs would hide, so it is tested
directly rather than only through a scraper."""

from datetime import date, datetime

import pytest

from morocco_scraper.normalize import (
    MOROCCO_TZ,
    classify_domains,
    clean_text,
    fold,
    make_content_hash,
    make_fingerprint,
    parse_deadline,
    parse_french_date,
    parse_int,
    parse_time_of_day,
)


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("28 Août 2026", date(2026, 8, 28)),
        ("1er mars 2027", date(2027, 3, 1)),
        ("13 Septembre 2026", date(2026, 9, 13)),
        ("5 fevrier 2026", date(2026, 2, 5)),
        ("15 déc. 2026", date(2026, 12, 15)),
        ("28/08/2026", date(2026, 8, 28)),
        ("2026-08-28", date(2026, 8, 28)),
        ("Limite de dépôt : 28 Août 2026 - 16:30", date(2026, 8, 28)),
    ],
)
def test_parses_the_date_formats_moroccan_sites_use(raw, expected):
    assert parse_french_date(raw) == expected


@pytest.mark.parametrize("raw", ["", None, "bientôt", "32 Août 2026", "hors délai"])
def test_unparseable_dates_return_none_instead_of_raising(raw):
    assert parse_french_date(raw) is None


def test_deadline_combines_date_and_time_in_morocco_time():
    assert parse_deadline("28 Août 2026 - 16:30") == datetime(
        2026, 8, 28, 16, 30, tzinfo=MOROCCO_TZ
    )


def test_deadline_without_a_time_means_end_of_day():
    assert parse_deadline("28 Août 2026") == datetime(2026, 8, 28, 23, 59, tzinfo=MOROCCO_TZ)


def test_time_is_read_from_either_separator():
    assert parse_time_of_day("16h30").hour == 16
    assert parse_time_of_day("dépôt avant 09:05").minute == 5


def test_clean_text_collapses_whitespace_and_entities():
    assert clean_text("  Ministère\xa0 de   l&#039;Intérieur \n") == "Ministère de l'Intérieur"
    assert clean_text("   ") is None


def test_fold_ignores_case_and_accents():
    assert fold("Génie Civil") == fold("genie  civil")


def test_parse_int_reads_the_position_count():
    assert parse_int("12 postes") == 12
    assert parse_int("1 poste") == 1
    assert parse_int("plusieurs") is None


class TestDomainClassification:
    def test_tags_by_speciality_not_just_title(self):
        domains = classify_domains(
            "Avis de concours de recrutement de Commissaire Judiciaire",
            "Etudes portugaises ou traduction (portugais)",
        )
        assert "law" in domains and "humanities" in domains

    def test_a_specific_phrase_outranks_a_generic_one(self):
        assert classify_domains("Ingénieur d'État en Génie Civil")[0] == "civil-engineering"

    def test_falls_back_to_other_so_every_row_is_filterable(self):
        assert classify_domains("Avis") == ["other"]
        assert classify_domains(None) == ["other"]

    def test_caps_the_number_of_tags(self):
        tags = classify_domains(
            "ingénieur informatique droit finance santé agriculture transport", limit=3
        )
        assert len(tags) == 3

    def test_arabic_vocabulary_is_matched_like_any_other_keyword(self):
        assert classify_domains("فتح باب الترشيح لولوج كليات العلوم والتقنيات") == ["sciences"]

    def test_an_uppercase_institution_acronym_is_recognised(self):
        assert classify_domains("Résultats de présélection ENCG 2026-2027") == [
            "management-business"
        ]

    def test_the_acronym_match_is_case_sensitive_so_ordinary_french_is_safe(self):
        """EST is also the ordinary French verb form ("c'est", "il est").
        Matching it case-insensitively would tag nearly every French
        sentence as engineering."""
        assert classify_domains("C'est une opportunité de recrutement dans la vente") != [
            "engineering"
        ]
        assert classify_domains("Il est recommandé de postuler avant la date limite") == ["other"]

    def test_the_acronym_match_requires_a_word_boundary(self):
        """"ENA" must not match inside an unrelated capitalised word."""
        assert classify_domains("ENARBONNE, une entreprise partenaire") != ["administration"]

    def test_an_acronym_and_a_keyword_can_both_contribute(self):
        """A title naming two institutions tags both fields -- that is
        correct when the announcement genuinely covers both, not a bug."""
        tags = classify_domains("Concours ENCG et FMP-FMD 2026 : seuils publiés")
        assert "management-business" in tags
        assert "health-medicine" in tags


class TestDeduplicationHashes:
    def test_fingerprint_ignores_case_accents_and_spacing(self):
        a = make_fingerprint("Ingénieur d'État", "Ministère de l'Intérieur", None)
        b = make_fingerprint("INGENIEUR  D'ETAT ", "ministere de l'interieur", None)
        assert a == b

    def test_fingerprint_ignores_the_time_of_day_of_a_deadline(self):
        morning = datetime(2026, 8, 28, 9, 0, tzinfo=MOROCCO_TZ)
        evening = datetime(2026, 8, 28, 16, 30, tzinfo=MOROCCO_TZ)
        assert make_fingerprint("X", "Y", morning) == make_fingerprint("X", "Y", evening)

    def test_fingerprint_separates_different_deadlines(self):
        d1 = datetime(2026, 8, 28, 9, 0, tzinfo=MOROCCO_TZ)
        d2 = datetime(2026, 9, 28, 9, 0, tzinfo=MOROCCO_TZ)
        assert make_fingerprint("X", "Y", d1) != make_fingerprint("X", "Y", d2)

    def test_content_hash_is_order_independent(self):
        assert make_content_hash({"a": 1, "b": 2}) == make_content_hash({"b": 2, "a": 1})

    def test_content_hash_changes_when_content_changes(self):
        assert make_content_hash({"a": 1}) != make_content_hash({"a": 2})
