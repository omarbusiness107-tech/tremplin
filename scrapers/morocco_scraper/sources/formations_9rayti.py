"""9rayti's directory of Bachelor, Master and Doctorat programmes.

Unlike ``/concoursa`` announcements, these are durable programme pages rather
than time-limited calls.  Their detail pages carry the school, programme,
admission requirements, subjects, objectives and career outcomes that make a
catalogue entry useful, so the normal run enriches every listing from its
detail page.  ``fetch_details=False`` remains available for a quick health
check of the directory itself.

robots.txt is ``User-agent: * / Allow: /``. Checked 2026-08-27.
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

from ..models import Opportunity, OpportunityType
from ..normalize import classify_domains, clean_text, fold
from ..registry import register
from ._nine_rayti import entry_level_for_type, programme_type_from_title
from .base import BaseScraper


class LayoutChanged(RuntimeError):
    """A programme listing no longer has its expected result grid."""


@register
class Formations9raytiScraper(BaseScraper):
    """Read the three server-rendered 9rayti programme directories."""

    key = "formations_9rayti"
    name = "9rayti.com — Formations Bachelor, Master et Doctorat"
    homepage_url = "https://www.9rayti.com"
    robots_note = "robots.txt is `User-agent: * / Allow: /`. Checked 2026-08-27."

    # The source-level ``--pages`` setting applies to each category.
    DEFAULT_PAGES = 3
    CATEGORIES = (
        ("bachelor", OpportunityType.BACHELOR),
        ("master", OpportunityType.MASTER),
        ("doctorat", OpportunityType.DOCTORAT),
    )
    PATH_RE = re.compile(r"^/formation/(?P<slug>[^/?#]+)/?$")

    # 9rayti programme pages do not expose a separate address field.  They
    # do, however, identify the school both by name and by a stable school
    # URL (for example ``/ecole/fsa-agadir``).  Keep this list deliberately
    # explicit: a city is better left unknown than guessed from a vague title.
    CITY_ALIASES = {
        "agadir": "Agadir",
        "ait melloul": "Aït Melloul",
        "beni mellal": "Béni Mellal",
        "berrechid": "Berrechid",
        "casablanca": "Casablanca",
        "dar bouazza": "Dar Bouazza",
        "el jadida": "El Jadida",
        "fes": "Fès",
        "fez": "Fès",
        "kenitra": "Kénitra",
        "khouribga": "Khouribga",
        "laayoune": "Laâyoune",
        "marrakech": "Marrakech",
        "meknes": "Meknès",
        "mohammedia": "Mohammedia",
        "oujda": "Oujda",
        "rabat": "Rabat",
        "sale": "Salé",
        "settat": "Settat",
        "tanger": "Tanger",
        "tangier": "Tanger",
        "temara": "Témara",
        "tetouan": "Tétouan",
        # Some school names omit their city entirely. These institutions
        # have one Moroccan campus for the programmes published by 9rayti.
        "essec": "Rabat",
        "euromed": "Fès",
        "hestim": "Casablanca",
        "mundiapolis": "Casablanca",
        "ostelea": "Casablanca",
        "vinci": "Rabat",
    }

    def scrape(self) -> Iterator[Opportunity]:
        max_pages = int(self.options.get("pages") or self.DEFAULT_PAGES)
        max_items = self.options.get("max_items")
        fetch_details = self.options.get("fetch_details", True)
        emitted = 0
        seen_ids: set[str] = set()

        for category, category_type in self.CATEGORIES:
            for page in range(1, max_pages + 1):
                url = urljoin(self.homepage_url, f"/type-formation/{category}")
                if page > 1:
                    url = f"{url}?page={page}"
                self.log.info("%s listing page %s: %s", category, page, url)
                soup = BeautifulSoup(self.http.get_text(url), "lxml")
                cards = self._listing_cards(soup)
                if not cards:
                    if page == 1:
                        raise LayoutChanged(
                            f"no programme cards found for {category} on {url}"
                        )
                    self.log.info("%s page %s is empty, stopping", category, page)
                    break

                for card in cards:
                    try:
                        opportunity = self._parse_card(card, category, category_type)
                    except Exception as exc:
                        self.warn(f"could not parse a {category} programme on page {page}: {exc}")
                        continue
                    if opportunity is None or opportunity.external_id in seen_ids:
                        continue
                    seen_ids.add(opportunity.external_id)

                    if fetch_details:
                        try:
                            self._enrich_from_detail(opportunity)
                        except Exception as exc:
                            self.warn(
                                f"detail fetch failed for {opportunity.external_id}: {exc}"
                            )

                    yield opportunity
                    emitted += 1
                    if max_items and emitted >= max_items:
                        self.log.info("reached max_items=%s", max_items)
                        return

    def _listing_cards(self, soup: BeautifulSoup) -> list[Tag]:
        grid = soup.select_one("div.list-grid-2")
        if grid is None:
            return []
        return [card for card in grid.select("a[href]") if self.PATH_RE.match(card["href"])]

    def _parse_card(
        self, card: Tag, category: str, category_type: OpportunityType
    ) -> Opportunity | None:
        match = self.PATH_RE.match(card.get("href", ""))
        if not match:
            return None
        title = clean_text(card.get_text(" ", strip=True))
        if not title:
            self.warn(f"programme {match['slug']} has no title")
            return None

        opportunity_type = programme_type_from_title(title, category_type)
        return Opportunity(
            source_key=self.key,
            external_id=match["slug"],
            application_link=urljoin(self.homepage_url, card["href"]),
            title=title,
            type=opportunity_type,
            domains=classify_domains(title),
            required_education_level=entry_level_for_type(opportunity_type),
            attributes={"Listing category": category, "Listing kind": "programme catalogue"},
        )

    # -- detail ----------------------------------------------------------

    def _enrich_from_detail(self, opportunity: Opportunity) -> None:
        """Fill a catalogue row with the programme page's useful content."""
        soup = BeautifulSoup(self.http.get_text(opportunity.application_link), "lxml")
        brief = self._brief(soup)
        sections = self._detail_sections(soup)

        institution = brief.get("ecole") or brief.get("etablissement")
        if institution:
            opportunity.institution = institution
        opportunity.location_city = self._city_from_school(
            institution,
            brief.get("ecole url") or brief.get("etablissement url"),
            opportunity.title,
        )

        sector = brief.get("secteurs de formation") or brief.get("secteur de formation")
        introduction = sections.pop("Introduction", None)
        conditions = self._admission_text(soup)

        opportunity.description = introduction
        opportunity.conditions_to_apply = conditions
        opportunity.domains = classify_domains(
            opportunity.title,
            institution,
            sector,
            introduction,
        )

        # The type and school already have dedicated columns. Everything
        # else remains visible as a labelled section on the detail page.
        attributes: dict[str, str] = {}
        if sector:
            attributes["Secteurs de formation"] = sector
        attributes.update(sections)
        opportunity.attributes = attributes

    def _brief(self, soup: BeautifulSoup) -> dict[str, str]:
        """Read the label/value pairs in the ``En Bref`` panel."""
        section = self._collapsible(soup, "en bref")
        if section is None:
            self.warn("programme detail has no En Bref section")
            return {}

        values: dict[str, str] = {}
        content = section.select_one(".collapsible__content") or section
        for item in content.select("div.d-flex.align-center.gap-md"):
            label_node = item.select_one("p.text-muted")
            if label_node is None:
                continue
            label = clean_text(label_node.get_text(" ", strip=True))
            value_node = item.select_one("a.text-dark, p.text-dark")
            value = clean_text(value_node.get_text(" ", strip=True)) if value_node else None
            if label and value:
                key = fold(label)
                values[key] = value
                if value_node and value_node.name == "a" and value_node.get("href"):
                    values[f"{key} url"] = value_node["href"]
        return values

    @classmethod
    def _city_from_school(
        cls,
        school_name: str | None,
        school_url: str | None,
        programme_title: str | None = None,
    ) -> str | None:
        """Return a verified Moroccan city mentioned by the school metadata."""
        candidates = [
            school_name or "",
            (school_url or "").replace("-", " "),
            programme_title or "",
        ]
        source = fold(" ".join(candidates))
        for alias, city in cls.CITY_ALIASES.items():
            if re.search(rf"(?<!\w){re.escape(alias)}(?!\w)", source):
                return city
        return None

    def _detail_sections(self, soup: BeautifulSoup) -> dict[str, str]:
        """Return every useful collapsible panel, preserving its structure."""
        sections: dict[str, str] = {}
        for section in soup.select("section.collapsible"):
            heading = section.select_one(":scope > header h2")
            label = clean_text(heading.get_text(" ", strip=True)) if heading else None
            if not label or fold(label) in {"en bref", "formations similaires"}:
                continue
            content = section.select_one(":scope > .collapsible__content")
            text = self._structured_text(content) if content else None
            if text:
                sections[label] = text
        return sections

    def _admission_text(self, soup: BeautifulSoup) -> str | None:
        """Extract admission/access subsections from the long introduction."""
        section = self._collapsible(soup, "introduction")
        content = section.select_one(".collapsible__content") if section else None
        if content is None:
            return None

        matches: list[str] = []
        for heading in content.select("h2, h3"):
            label = clean_text(heading.get_text(" ", strip=True))
            if not label or not any(
                marker in fold(label)
                for marker in ("admission", "condition", "acces", "eligib", "candidat")
            ):
                continue

            lines = [f"## {label}"]
            for sibling in heading.find_next_siblings():
                if sibling.name in ("h2", "h3"):
                    break
                lines.extend(self._element_lines(sibling))
            if len(lines) > 1:
                matches.append("\n".join(lines))
        return "\n\n".join(matches) or None

    def _collapsible(self, soup: BeautifulSoup, wanted: str) -> Tag | None:
        for section in soup.select("section.collapsible"):
            heading = section.select_one(":scope > header h2")
            if heading and fold(heading.get_text(" ", strip=True)) == wanted:
                return section
        return None

    def _structured_text(self, node: Tag) -> str | None:
        body = node.select_one("div.mt-md.d-flex.flex-column") or node
        lines: list[str] = []
        for child in body.find_all(["h2", "h3", "p", "li"]):
            # A paragraph inside a list item would repeat the item's text.
            if child.name == "p" and child.find_parent("li") is not None:
                continue
            text = clean_text(child.get_text(" ", strip=True))
            if not text:
                continue
            if child.name in ("h2", "h3"):
                lines.append(f"## {text}")
            elif child.name == "li":
                lines.append(f"• {text}")
            else:
                lines.append(text)
        return "\n".join(lines) or None

    @staticmethod
    def _element_lines(node: Tag) -> list[str]:
        lines: list[str] = []
        candidates = node.find_all(["p", "li"], recursive=True)
        if not candidates:
            candidates = [node]
        for child in candidates:
            if child.name == "p" and child.find_parent("li") is not None:
                continue
            text = clean_text(child.get_text(" ", strip=True))
            if text:
                lines.append(f"• {text}" if child.name == "li" else text)
        return lines
