"""Shared normalization for Moroccan community opportunity sites.

These sites publish useful leads but do not expose a common structured API.
The helpers here keep their feed scrapers conservative: values are only
filled when the article names them, and application links always retain a
working article fallback.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from ..models import OpportunityType
from ..normalize import clean_text, fold, parse_deadline


CITY_ALIASES: dict[str, str] = {
    "ait melloul": "Aït Melloul",
    "al hoceima": "Al Hoceïma",
    "beni mellal": "Béni Mellal",
    "dar bouazza": "Dar Bouazza",
    "el jadida": "El Jadida",
    "sidi bennour": "Sidi Bennour",
    "agadir": "Agadir",
    "berkane": "Berkane",
    "berrechid": "Berrechid",
    "casablanca": "Casablanca",
    "casa": "Casablanca",
    "dakhla": "Dakhla",
    "errachidia": "Errachidia",
    "fes": "Fès",
    "fez": "Fès",
    "guelmim": "Guelmim",
    "kenitra": "Kénitra",
    "khouribga": "Khouribga",
    "laayoune": "Laâyoune",
    "larache": "Larache",
    "marrakech": "Marrakech",
    "meknes": "Meknès",
    "mohammedia": "Mohammedia",
    "nador": "Nador",
    "nouaceur": "Nouaceur",
    "ouarzazate": "Ouarzazate",
    "oujda": "Oujda",
    "rabat": "Rabat",
    "safi": "Safi",
    "sale": "Salé",
    "settat": "Settat",
    "smara": "Smara",
    "tanger": "Tanger",
    "tangier": "Tanger",
    "taroudant": "Taroudant",
    "taza": "Taza",
    "tetouan": "Tétouan",
}

_CITY_PATTERNS = tuple(
    (re.compile(rf"(?<!\w){re.escape(alias)}(?!\w)"), city)
    for alias, city in sorted(CITY_ALIASES.items(), key=lambda item: len(item[0]), reverse=True)
)

_RESULT_MARKERS = (
    "resultat",
    "resultats",
    "liste des convoques",
    "liste des candidats convoques",
    "liste definitive",
    "liste d'attente",
    "admis au concours",
    "نتائج",
    "لائحة المدعوين",
)

_GENERIC_CATEGORY_MARKERS = (
    "alwadifa",
    "bourse",
    "concours",
    "cycle d'ingenieur",
    "emploi",
    "licence",
    "master",
    "orientation",
    "مستجدات الوظيفة",
)

_DATE_TOKEN_RE = re.compile(
    r"\d{1,2}[/.-]\d{1,2}[/.-]\d{4}"
    r"|\d{1,2}\s*(?:er)?\s+[A-Za-zÀ-ÿ]+\.?\s+\d{4}",
    re.IGNORECASE,
)

_DEADLINE_MARKERS = (
    "dernier delai",
    "date limite",
    "avant le",
    "preinscription",
    "pre-inscription",
    "inscription en ligne",
    "آخر اجل",
)

_APPLICATION_MARKERS = (
    "inscription",
    "preinscription",
    "candidature",
    "postuler",
    "apply",
    "recrutement",
)

_SKIP_HOST_MARKERS = (
    "blogger.googleusercontent.com",
    "facebook.com",
    "instagram.com",
    "linkedin.com",
    "twitter.com",
    "whatsapp.com",
    "youtube.com",
)


def city_from_text(*values: str | None) -> str | None:
    """Return the first explicit Moroccan city in high-signal metadata."""
    source = fold(" ".join(value for value in values if value).replace("-", " "))
    for pattern, city in _CITY_PATTERNS:
        if pattern.search(source):
            return city
    return None


def is_non_applicable(title: str) -> bool:
    """Exclude result/convocation notices that no longer accept applications."""
    normalized = fold(title)
    return any(marker in normalized for marker in _RESULT_MARKERS)


def opportunity_type_from_text(
    title: str,
    categories: list[str] | None = None,
    default: OpportunityType | None = None,
) -> OpportunityType:
    """Classify mixed community feeds, with explicit study cycles winning."""
    text = fold(" ".join([title, *(categories or [])]))
    if any(marker in text for marker in ("bourse", "scholarship", "منحة")):
        return OpportunityType.SCHOLARSHIP
    if any(marker in text for marker in ("stage", "stagiaire", "internship", "pfe")):
        return OpportunityType.INTERNSHIP
    if any(marker in text for marker in ("doctorat", "cycle doctoral", "phd", "دكتوراه")):
        return OpportunityType.DOCTORAT
    if any(marker in text for marker in ("master", "mastere", "ماستر", "ماجستير")):
        return OpportunityType.MASTER
    if any(
        marker in text
        for marker in (
            "bachelor",
            "licence",
            "license",
            "deust",
            "dut",
            "الإجازة",
            "الاجازة",
        )
    ):
        return OpportunityType.BACHELOR
    if "concours" in text or "cycle d'ingenieur" in text or "مباراة" in text:
        return OpportunityType.CONCOURS
    return default or OpportunityType.JOB


def content_lines(html: str | None, *, max_chars: int = 10_000) -> list[str]:
    """Turn noisy article HTML into unique, readable lines."""
    if not html:
        return []
    soup = BeautifulSoup(html, "lxml")
    for node in soup.select("script, style, noscript, iframe"):
        node.decompose()

    lines: list[str] = []
    seen: set[str] = set()
    length = 0
    for raw in soup.stripped_strings:
        line = clean_text(str(raw))
        key = fold(line)
        if not line or len(line) < 2 or key in seen:
            continue
        if any(marker in key for marker in ("cookie", "adsbygoogle", "politique de confidentialite")):
            continue
        if length + len(line) > max_chars:
            break
        seen.add(key)
        lines.append(line)
        length += len(line) + 1
    return lines


def description_from_html(html: str | None) -> str | None:
    lines = content_lines(html)
    return "\n".join(lines) or None


def conditions_from_html(html: str | None) -> str | None:
    lines = content_lines(html, max_chars=12_000)
    selected: list[str] = []
    for index, line in enumerate(lines):
        normalized = fold(line)
        if any(
            marker in normalized
            for marker in ("condition", "admission", "eligib", "profil", "diplome requis", "شروط")
        ):
            selected.extend(lines[index : index + 5])
    # Preserve order while collapsing overlapping windows.
    unique = list(dict.fromkeys(selected))
    return "\n".join(unique[:20]) or None


def deadline_from_html(html: str | None) -> datetime | None:
    """Read dates only from lines that explicitly describe applying."""
    candidates: list[datetime] = []
    for line in content_lines(html, max_chars=14_000):
        normalized = fold(line)
        if not any(marker in normalized for marker in _DEADLINE_MARKERS):
            continue
        for match in _DATE_TOKEN_RE.finditer(line):
            parsed = parse_deadline(match.group())
            if parsed:
                candidates.append(parsed)
    return max(candidates) if candidates else None


def direct_application_link(
    html: str | None,
    *,
    article_url: str,
    homepage_url: str,
) -> str:
    """Prefer a labelled registration link; retain the article as fallback."""
    if not html:
        return article_url
    soup = BeautifulSoup(html, "lxml")
    source_host = urlparse(homepage_url).netloc.removeprefix("www.")
    for anchor in soup.select("a[href]"):
        href = urljoin(article_url, anchor.get("href", ""))
        parsed = urlparse(href)
        if parsed.scheme not in {"http", "https"}:
            continue
        host = parsed.netloc.removeprefix("www.")
        if host == source_host or any(marker in host for marker in _SKIP_HOST_MARKERS):
            continue
        signal = fold(f"{anchor.get_text(' ', strip=True)} {parsed.path}")
        if any(marker in signal for marker in _APPLICATION_MARKERS):
            return href
    return article_url


def institution_from_metadata(title: str, categories: list[str] | None = None) -> str | None:
    """Use a specific feed category, then a conservative title pattern."""
    candidates: list[str] = []
    for category in categories or []:
        normalized = fold(category)
        if not normalized or any(marker in normalized for marker in _GENERIC_CATEGORY_MARKERS):
            continue
        city = city_from_text(category)
        if city and fold(category) in {fold(alias) for alias in CITY_ALIASES}:
            continue
        if 2 < len(category) <= 100:
            candidates.append(category)
    if candidates:
        return clean_text(max(candidates, key=len))

    patterns = (
        r"(?:master|licence(?: professionnelle| d'excellence)?|bachelor|doctorat|cycle d['’]ingenieur)\s+(?:a la |au |a l['’]|en )?(?P<name>.+?)(?:\s+20\d{2}(?:[-/]\d{2,4})?|$)",
        r"^concours(?: de recrutement)?\s+(?P<name>.+?)(?:\s+20\d{2}|\s*\(|$)",
        r"^(?P<name>.+?)\s+(?:recrute|recrutement)",
    )
    for pattern in patterns:
        if match := re.search(pattern, title, re.IGNORECASE):
            value = clean_text(match.group("name"))
            if value and len(value) <= 120:
                return value.strip(" -–—:")
    return None


def published_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.strip().replace("Z", "+00:00")).date()
    except ValueError:
        return None


def positions_from_text(value: str | None) -> int | None:
    if not value:
        return None
    if match := re.search(r"(?<!\d)(\d{1,5})\s+(?:postes?|positions?)\b", value, re.IGNORECASE):
        return int(match.group(1))
    return None
