"""Emploi Public (emploi-public.ma) -- Moroccan public-sector concours.

The official MMSP portal for civil-service recruitment competitions. It was
picked as the first source because it is the cleanest pipeline to prove out:

* pages are server-rendered, so no browser is needed;
* every listing carries a UUID in its URL, which is a perfect `external_id`;
* detail pages expose eligibility as label/value pairs rather than prose.

robots.txt (checked 2026-08-24) has a single `User-agent: *` group that
disallows only the `/{fr,ar}/concours/download/...` PDF endpoints. The
listing and detail pages this scraper reads are permitted, and it never
touches a download URL. PoliteSession re-checks robots.txt on every run, so
if that ever changes the scraper stops on its own.
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

from ..models import EducationLevel, Opportunity, OpportunityType
from ..normalize import (
    clean_text,
    fold,
    classify_domains,
    parse_deadline,
    parse_french_date,
    parse_int,
)
from ..registry import register
from .base import BaseScraper

DETAIL_PATH_RE = re.compile(r"/fr/concours/details/(?P<uuid>[0-9a-f-]{36})")


class LayoutChanged(RuntimeError):
    """The listing page no longer looks like we expect.

    Raised only for a whole-page failure, which fails the run and surfaces
    on the admin page -- that is the signal to go fix the selectors.
    """


@register
class EmploiPublicScraper(BaseScraper):
    key = "emploi_public"
    name = "Emploi Public (MMSP)"
    homepage_url = "https://www.emploi-public.ma"
    robots_note = "robots.txt disallows only /*/concours/download/ ; listings are permitted."

    LISTING_PATH = "/fr/concours-liste"
    DEFAULT_PAGES = 3

    # The listing interleaves stages of a concours' lifecycle. Only
    # "Annonce" is something a user can still apply to -- "Convocation" and
    # "Résultats" are follow-up notices whose "deadline" is the exam date,
    # not an application cut-off, so they are skipped by default.
    APPLICABLE_STAGE = "annonce"

    # Sidebar / description labels, folded (lowercase, no accents).
    LABEL_INSTITUTION = "administration qui recrute"
    LABEL_DEADLINE = "delai de depot des candidatures"
    LABEL_EVENT_DATE = "date du concours"
    LABEL_PUBLISHED = "date de publication"
    LABEL_SPECIALITY = "specialite"
    LABEL_GRADE = "grade"
    LABEL_POSITIONS = "nombre de postes"
    LABEL_CITY = ("ville", "lieu", "lieu du concours", "region")

    # Labels whose value already has a first-class column. Excluded from
    # `attributes` and `description` so the detail page does not show them
    # twice, and -- more importantly -- so their label text does not enter
    # the search index. "Administration qui recrute" appears on every
    # listing and stems to the same token as "administrateur", which made a
    # search for that grade match the entire table.
    COLUMN_BACKED_LABELS = frozenset(
        {
            "administration qui recrute",
            "delai de depot des candidatures",
            "date du concours",
            "date de publication",
            "nombre de postes",
            "ville",
            "lieu",
            "lieu du concours",
            "region",
        }
    )

    # Labels that describe who may apply, joined into conditions_to_apply.
    ELIGIBILITY_LABELS = (
        "specialite",
        "grade",
        "diplome",
        "diplome requis",
        "type de recrutement",
        "conditions",
        "profil",
    )

    def scrape(self) -> Iterator[Opportunity]:
        max_pages = int(self.options.get("pages") or self.DEFAULT_PAGES)
        max_items = self.options.get("max_items")
        fetch_details = self.options.get("fetch_details", True)
        include_all_stages = bool(self.options.get("include_all_stages"))

        emitted = 0
        for page in range(1, max_pages + 1):
            url = urljoin(self.homepage_url, f"{self.LISTING_PATH}?page={page}")
            self.log.info("listing page %s: %s", page, url)
            soup = BeautifulSoup(self.http.get_text(url), "lxml")

            cards = self._listing_cards(soup)
            if not cards:
                if page == 1:
                    raise LayoutChanged(
                        f"no .s-item cards found on {url} - the listing markup probably changed"
                    )
                self.log.info("page %s is empty, stopping", page)
                break

            for card in cards:
                try:
                    opportunity = self._parse_card(card, include_all_stages=include_all_stages)
                except Exception as exc:  # one broken card must not stop the source
                    self.warn(f"could not parse a listing card on page {page}: {exc}")
                    continue
                if opportunity is None:
                    continue

                if fetch_details:
                    try:
                        self._enrich_from_detail(opportunity)
                    except Exception as exc:
                        # Listing-level data is already usable; keep it.
                        self.warn(f"detail fetch failed for {opportunity.external_id}: {exc}")

                yield opportunity
                emitted += 1
                if max_items and emitted >= max_items:
                    self.log.info("reached max_items=%s", max_items)
                    return

            if not self._has_next_page(soup, page):
                break

    # -- listing ---------------------------------------------------------

    def _listing_cards(self, soup: BeautifulSoup) -> list[Tag]:
        """Cards inside the result list only.

        The page also renders a "Dernière chance pour postuler" carousel of
        `.card` elements; scoping to `#listing-switcher .s-item` keeps those
        promotional duplicates out of the result set.
        """
        container = soup.select_one("#listing-switcher")
        if container is None:
            return []
        return container.select(".s-item")

    def _parse_card(self, card: Tag, *, include_all_stages: bool = False) -> Opportunity | None:
        link = card.select_one('a[href*="/concours/details/"]')
        if link is None:
            return None

        stage = clean_text(self._text(card, ".card-type"))
        if not include_all_stages and stage and not fold(stage).startswith(self.APPLICABLE_STAGE):
            self.log.debug("skipping %s stage listing", stage)
            return None

        href = link.get("href", "")
        match = DETAIL_PATH_RE.search(href)
        if not match:
            self.warn(f"unrecognised detail URL: {href!r}")
            return None

        title = clean_text(self._text(card, "h2.card-title, .card-title"))
        if not title:
            self.warn(f"card {match['uuid']} has no title")
            return None

        institution = clean_text(self._text(card, ".card-text"))
        detail_url = urljoin(self.homepage_url, href)

        logo = card.select_one(".card-body img[src]")
        logo_url = urljoin(self.homepage_url, logo["src"]) if logo else None

        deadline = None
        event_date = None
        positions = None
        for entry in card.select(".card-footer div"):
            text = clean_text(entry.get_text(" ", strip=True)) or ""
            folded = fold(text)
            if "limite de depot" in folded:
                deadline = parse_deadline(text)
                if deadline is None:
                    self.warn(f"unparseable deadline {text!r} on {match['uuid']}")
            elif "date du concours" in folded:
                event_date = parse_french_date(text)
            elif "poste" in folded:
                positions = parse_int(text)

        return Opportunity(
            source_key=self.key,
            external_id=match["uuid"],
            application_link=detail_url,
            title=title,
            type=OpportunityType.CONCOURS,
            institution=institution,
            institution_logo_url=logo_url,
            domains=classify_domains(title, institution),
            deadline=deadline,
            event_date=event_date,
            positions_available=positions,
            attributes={"Étape": stage} if stage else {},
        )

    def _has_next_page(self, soup: BeautifulSoup, current: int) -> bool:
        return soup.select_one(f'.pagination a[href*="page={current + 1}"]') is not None

    # -- detail ----------------------------------------------------------

    def _enrich_from_detail(self, opportunity: Opportunity) -> None:
        """Fill in eligibility, description and dates from the detail page.

        Everything here is additive: whatever the listing card already gave
        us stays unless the detail page has a better value.
        """
        soup = BeautifulSoup(self.http.get_text(opportunity.application_link), "lxml")
        fields = self._labelled_values(soup)
        if not fields:
            self.warn(f"detail page for {opportunity.external_id} exposed no label/value pairs")
            return

        for label, value in fields.items():
            folded = fold(label)
            if folded == self.LABEL_INSTITUTION:
                opportunity.institution = value
            elif folded == self.LABEL_DEADLINE:
                if (parsed := parse_deadline(value)) is not None:
                    opportunity.deadline = parsed
            elif folded == self.LABEL_EVENT_DATE:
                opportunity.event_date = parse_french_date(value) or opportunity.event_date
            elif folded == self.LABEL_PUBLISHED:
                opportunity.published_at = parse_french_date(value)
            elif folded == self.LABEL_POSITIONS:
                opportunity.positions_available = parse_int(value) or opportunity.positions_available
            elif folded in self.LABEL_CITY:
                opportunity.location_city = value

        # Everything the columns do not already carry, verbatim: the detail
        # page renders these as a table, so a new label appears without
        # needing a scraper change.
        extras = {
            label: value
            for label, value in fields.items()
            if fold(label) not in self.COLUMN_BACKED_LABELS
        }
        opportunity.attributes = {**opportunity.attributes, **extras}

        # Indexed at the lowest weight; keeps the concours code and
        # speciality searchable without re-indexing the structured columns.
        opportunity.description = (
            "\n".join(f"{label} : {value}" for label, value in extras.items()) or None
        )

        conditions = [
            f"{label} : {value}"
            for label, value in fields.items()
            if fold(label) in self.ELIGIBILITY_LABELS
        ]
        if conditions:
            opportunity.conditions_to_apply = "\n".join(conditions)

        grade = next(
            (v for k, v in fields.items() if fold(k) in (self.LABEL_GRADE, self.LABEL_SPECIALITY)),
            None,
        )
        opportunity.required_education_level = _infer_education_level(opportunity.title, grade)

        # Re-tag now that we have the speciality, which is far more precise
        # than the job title alone.
        speciality = next(
            (v for k, v in fields.items() if fold(k) == self.LABEL_SPECIALITY), None
        )
        opportunity.domains = classify_domains(
            opportunity.title, speciality, grade, opportunity.institution
        )

        if (banner := soup.select_one(".banner-logo img[src]")) is not None:
            opportunity.institution_logo_url = urljoin(self.homepage_url, banner["src"])

    def _labelled_values(self, soup: BeautifulSoup) -> dict[str, str]:
        """Collect the detail page's label/value pairs.

        Two shapes carry them:
          sidebar      <h3 class="h4"><span>Label</span> Value </h3>
          description  <li><span>Label :</span><strong>Value</strong></li>
        """
        fields: dict[str, str] = {}

        for heading in soup.select(".s-content-box h3.h4"):
            label_tag = heading.find("span")
            if label_tag is None:
                continue
            label = clean_text(label_tag.get_text(" ", strip=True))
            label_tag.extract()
            value = _meaningful(clean_text(heading.get_text(" ", strip=True)))
            if label and value:
                fields.setdefault(label.rstrip(" :"), value)

        for item in soup.select(".s-content-box li"):
            label_tag = item.find("span")
            value_tag = item.find("strong")
            if label_tag is None or value_tag is None:
                continue
            label = clean_text(label_tag.get_text(" ", strip=True))
            # Values sometimes start with the bullet dash the page draws.
            value = _meaningful(clean_text(value_tag.get_text(" ", strip=True)))
            if label and value:
                fields.setdefault(label.rstrip(" :"), value)

        return fields

    @staticmethod
    def _text(node: Tag, selector: str) -> str | None:
        found = node.select_one(selector)
        return found.get_text(" ", strip=True) if found else None


def _meaningful(value: str | None) -> str | None:
    """Drop redaction placeholders the portal uses for withheld fields ("****")."""
    if not value:
        return None
    stripped = value.lstrip("- ").strip()
    return stripped or None if stripped.strip("*-. ") else None


# Moroccan civil-service grades map onto degree requirements predictably
# enough to be useful as a filter. Ordered most specific first; anything
# unrecognised stays None rather than guessing.
_EDUCATION_RULES: tuple[tuple[EducationLevel, tuple[str, ...]], ...] = (
    (EducationLevel.DOCTORAT, ("doctorat", "enseignement superieur", "phd")),
    (
        EducationLevel.MASTER,
        (
            "ingenieur d'etat", "ingenieur d etat", "administrateur", "echelle 11", "echelle 12",
            "master", "bac + 5", "bac+5", "architecte", "medecin", "professeur agrege",
        ),
    ),
    (EducationLevel.LICENCE, ("licence", "bac + 3", "bac+3", "redacteur", "echelle 10")),
    (
        EducationLevel.BAC_PLUS_2,
        ("technicien", "echelle 9", "bac + 2", "bac+2", "dut", "bts", "infirmier"),
    ),
    (EducationLevel.BAC, ("adjoint technique", "echelle 6", "echelle 7", "baccalaureat")),
)


def _infer_education_level(*texts: str | None) -> EducationLevel | None:
    haystack = fold(" ".join(t for t in texts if t))
    if not haystack:
        return None
    for level, keywords in _EDUCATION_RULES:
        if any(keyword in haystack for keyword in keywords):
            return level
    return None
