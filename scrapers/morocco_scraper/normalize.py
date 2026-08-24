"""Text, date and taxonomy helpers shared by every scraper.

Scrapers stay thin because all the messy normalization lives here: French
date parsing, accent folding, the keyword -> domain classifier, and the two
hashes the deduplication logic depends on.
"""

from __future__ import annotations

import hashlib
import html
import re
import unicodedata
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

# Listings publish local Moroccan wall-clock times ("16:30"); the database
# stores timestamptz, so deadlines are anchored to this zone.
MOROCCO_TZ = ZoneInfo("Africa/Casablanca")

_WHITESPACE_RE = re.compile(r"\s+")


def clean_text(value: str | None) -> str | None:
    """Unescape entities, collapse whitespace, drop empty strings."""
    if value is None:
        return None
    text = html.unescape(value).replace("\xa0", " ").replace("​", "")
    text = _WHITESPACE_RE.sub(" ", text).strip()
    return text or None


def strip_accents(value: str) -> str:
    """`Août` -> `Aout`. Used for matching, never for display."""
    return "".join(
        ch for ch in unicodedata.normalize("NFD", value) if unicodedata.category(ch) != "Mn"
    )


def fold(value: str | None) -> str:
    """Casefolded, accent-free, whitespace-collapsed form for comparisons."""
    if not value:
        return ""
    return _WHITESPACE_RE.sub(" ", strip_accents(value).casefold()).strip()


# --------------------------------------------------------------------------
# Dates
#
# Moroccan sites publish French month names, sometimes abbreviated, with
# inconsistent capitalisation and accents; numeric dd/mm/yyyy also shows up.
# --------------------------------------------------------------------------

_FRENCH_MONTHS = {
    "janvier": 1, "janv": 1, "jan": 1,
    "fevrier": 2, "fev": 2, "fevr": 2,
    "mars": 3, "mar": 3,
    "avril": 4, "avr": 4,
    "mai": 5,
    "juin": 6,
    "juillet": 7, "juil": 7, "jul": 7,
    "aout": 8, "aou": 8,
    "septembre": 9, "sept": 9, "sep": 9,
    "octobre": 10, "oct": 10,
    "novembre": 11, "nov": 11,
    "decembre": 12, "dec": 12,
}

_TEXT_DATE_RE = re.compile(
    r"(?P<day>\d{1,2})\s*(?:er)?\s+(?P<month>[A-Za-zÀ-ÿ]+)\.?\s+(?P<year>\d{4})"
)
_NUMERIC_DATE_RE = re.compile(r"(?P<day>\d{1,2})[/.-](?P<month>\d{1,2})[/.-](?P<year>\d{4})")
_ISO_DATE_RE = re.compile(r"(?P<year>\d{4})-(?P<month>\d{1,2})-(?P<day>\d{1,2})")
_TIME_RE = re.compile(r"(?P<hour>\d{1,2})\s*[:hH]\s*(?P<minute>\d{2})")


def parse_french_date(value: str | None) -> date | None:
    """Parse `28 Août 2026`, `1er mars 2027`, `28/08/2026` or `2026-08-28`.

    Returns None rather than raising: an unparseable date is a warning on
    the run, not a reason to drop the whole listing.
    """
    text = clean_text(value)
    if not text:
        return None

    if (m := _ISO_DATE_RE.search(text)) or (m := _NUMERIC_DATE_RE.search(text)):
        return _safe_date(int(m["year"]), int(m["month"]), int(m["day"]))

    if m := _TEXT_DATE_RE.search(text):
        month = _FRENCH_MONTHS.get(strip_accents(m["month"]).casefold().rstrip("."))
        if month is None:
            return None
        return _safe_date(int(m["year"]), month, int(m["day"]))

    return None


def parse_time_of_day(value: str | None) -> time | None:
    """Pull `16:30` / `16h30` out of a deadline string."""
    text = clean_text(value)
    if not text:
        return None
    if m := _TIME_RE.search(text):
        hour, minute = int(m["hour"]), int(m["minute"])
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            return time(hour, minute)
    return None


def parse_deadline(value: str | None) -> datetime | None:
    """Combine a French date and an optional time into an aware datetime.

    With no time given, a deadline means end of that day in Morocco.
    """
    day = parse_french_date(value)
    if day is None:
        return None
    clock = parse_time_of_day(value) or time(23, 59)
    return datetime.combine(day, clock, tzinfo=MOROCCO_TZ)


def _safe_date(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def parse_int(value: str | None) -> int | None:
    """First integer in the string: `1 poste` -> 1, `12 postes` -> 12."""
    text = clean_text(value)
    if not text:
        return None
    if m := re.search(r"\d+", text.replace(" ", "").replace(" ", "")):
        try:
            return int(m.group())
        except ValueError:
            return None
    return None


# --------------------------------------------------------------------------
# Domain classification
#
# Deliberately a keyword map, not a model: it is inspectable, cheap, and
# easy to correct when a listing lands in the wrong bucket. Keys are matched
# against the accent-folded text, so entries here must already be folded.
# --------------------------------------------------------------------------

DOMAIN_KEYWORDS: dict[str, tuple[str, ...]] = {
    "ai-data-science": (
        "intelligence artificielle", "data scien", "science des donnees", "machine learning",
        "big data", "deep learning", "data analyst", "statistique appliquee",
    ),
    "software-it": (
        "informatique", "developpeur", "developpement logiciel", "genie logiciel", "software",
        "systemes d'information", "systeme d'information", "reseaux", "cybersecurite",
        "securite des systemes", "web", "digital", "numerique", "programmation",
    ),
    "engineering": (
        "ingenieur", "ingenierie", "genie industriel", "genie mecanique", "genie electrique",
        "mecanique", "electrique", "electronique", "automatisme", "industriel", "maintenance",
        "المدارس العليا للتكنولوجيا", "العلوم التطبيقية", "الهندسة",
    ),
    "civil-engineering": (
        "genie civil", "btp", "batiment", "travaux publics", "topograph", "geotechnique",
    ),
    "energy-environment": (
        "energie", "energetique", "environnement", "renouvelable", "eau et assainissement",
        "developpement durable", "climat",
    ),
    "agriculture": (
        "agricole", "agronom", "agroalimentaire", "agriculture", "veterinaire", "peche",
        "foret", "horticulture",
    ),
    "health-medicine": (
        "sante", "medecin", "medical", "infirmier", "pharmac", "chirurg", "dentaire",
        "biolog medicale", "paramedical", "hospitalier",
        "الطب", "طب الأسنان", "الصيدلة", "التمريض",
    ),
    "law": (
        "droit", "juridique", "juriste", "judiciaire", "justice", "notariat", "contentieux",
        "legislation", "magistrat", "greffier", "huissier", "tribunal", "avocat",
        "الحقوق", "القانون",
    ),
    "economics-finance": (
        "economie", "economique", "finance", "financier", "comptab", "audit", "fiscal",
        "tresorerie", "banque", "assurance", "controle de gestion",
        "العلوم الاقتصادية", "التجارة",
    ),
    "management-business": (
        "gestion", "management", "commerce", "commercial", "marketing", "vente",
        "ressources humaines", "achat", "entrepreneuriat",
        "التسيير", "إدارة الأعمال",
    ),
    "administration": (
        "administrateur", "administration", "fonction publique", "secretariat",
        "affaires generales", "collectivites territoriales", "redacteur",
        "الإدارة العمومية", "الوظيفة العمومية",
    ),
    # Kept to words that describe *teaching* as the work. "universitaire"
    # and "pedagog" were dropped: every scholarship announcement mentions
    # "études universitaires" or an "équipe pédagogique", which put half
    # the scholarships in this field.
    "education-teaching": (
        "enseignant", "professeur", "instituteur", "formateur", "scolaire",
        "maitre de conferences", "professeur assistant", "enseignant chercheur",
        "sciences de l'education", "didactique", "corps enseignant",
        "الإجازة في التربية", "علوم التربية", "التكوين",
    ),
    "humanities": (
        "lettres", "sciences humaines", "histoire", "geographie", "sociolog", "philosoph",
        "langue", "traduction", "linguistique", "archeolog",
    ),
    "sciences": (
        "mathematiq", "physique", "chimie", "biologie", "sciences fondamentales", "geolog",
        "laboratoire",
        "العلوم والتقنيات", "كلية العلوم", "العلوم الأساسية",
    ),
    "architecture-design": (
        "architecte", "architecture", "urbanisme", "design", "amenagement", "الهندسة المعمارية",
    ),
    "communication-media": (
        "communication", "journalis", "audiovisuel", "media", "presse", "relations publiques",
        "السمعي البصري والسينما",
    ),
    "logistics-transport": (
        "logistique", "transport", "supply chain", "ferroviaire", "portuaire", "aerien",
        "douane",
    ),
    "customer-service": (
        "centre d'appel", "centres d'appel", "call center", "centre de contact",
        "relation client", "teleconseil", "televente", "telemarketing", "teleoperateur",
        "televendeur", "service client", "hotline", "support client", "back office",
        "chargé de clientele", "conseiller clientele", "outsourcing", "offshoring",
    ),
    "tourism-hospitality": ("tourisme", "hotell", "restauration", "artisanat"),
    "security-defense": (
        "securite", "police", "gendarmerie", "militaire", "defense", "protection civile",
        "sapeur", "penitentiaire",
    ),
}


# Moroccan institution acronyms, matched case-sensitively and whole-word
# against the RAW (unfolded) text rather than as a keyword substring.
# Folding would make this unsafe: "EST" is also ordinary French ("c'est",
# "il est"), and only the uppercase, standalone form is the institution.
# Matching case-sensitively against the original text sidesteps that
# entirely, since prose "est" is never capitalised mid-sentence.
ACRONYM_DOMAINS: dict[str, tuple[str, ...]] = {
    "sciences": ("FST",),
    "engineering": ("EST", "ENSA", "ENSAM"),
    "management-business": ("ENCG",),
    "administration": ("ENA",),
    "communication-media": ("ISMAC",),
    "health-medicine": ("FMD", "FMP"),
}

_ACRONYM_PATTERNS = {
    slug: [re.compile(rf"\b{re.escape(acronym)}\b") for acronym in acronyms]
    for slug, acronyms in ACRONYM_DOMAINS.items()
}


def classify_domains(*texts: str | None, limit: int = 3) -> list[str]:
    """Tag a listing with up to `limit` domain slugs.

    Ranked by how many distinct keywords matched, so a title mentioning
    "ingénieur informatique" lands under software-it and engineering rather
    than an arbitrary one of the two. Falls back to ["other"] so every row
    carries at least one filterable tag.
    """
    raw = " ".join(t for t in texts if t)
    haystack = fold(raw)
    if not haystack:
        return ["other"]

    scored: list[tuple[int, int, str]] = []
    for slug, keywords in DOMAIN_KEYWORDS.items():
        hits = sum(1 for kw in keywords if kw in haystack)
        # An institution acronym counts as a keyword hit too, so "FST" and
        # a matching subject keyword compound rather than one hiding the
        # other, and ties break the same way (longest match wins).
        acronym_hits = sum(1 for pat in _ACRONYM_PATTERNS.get(slug, ()) if pat.search(raw))
        total = hits + acronym_hits
        if total:
            lengths = [len(kw) for kw in keywords if kw in haystack]
            lengths += [
                len(pat.pattern) for pat in _ACRONYM_PATTERNS.get(slug, ()) if pat.search(raw)
            ]
            scored.append((total, max(lengths), slug))

    if not scored:
        return ["other"]

    scored.sort(reverse=True)
    return [slug for _, _, slug in scored[:limit]]


# --------------------------------------------------------------------------
# Deduplication hashes
# --------------------------------------------------------------------------


def make_fingerprint(title: str, institution: str | None, deadline: datetime | None) -> str:
    """Cross-source duplicate key: normalized title + institution + deadline.

    Uses the deadline's calendar date only -- two sites reporting the same
    call often differ on the cut-off time but never on the day.
    """
    parts = [
        fold(title),
        fold(institution),
        deadline.astimezone(MOROCCO_TZ).date().isoformat() if deadline else "",
    ]
    return hashlib.md5("|".join(parts).encode("utf-8")).hexdigest()


def make_content_hash(payload: dict[str, object]) -> str:
    """Hash of the user-visible fields, so re-scrapes can tell 'unchanged'
    from 'genuinely updated' without diffing every column."""
    items = sorted((k, "" if v is None else str(v)) for k, v in payload.items())
    joined = "|".join(f"{k}={v}" for k, v in items)
    return hashlib.md5(joined.encode("utf-8")).hexdigest()
