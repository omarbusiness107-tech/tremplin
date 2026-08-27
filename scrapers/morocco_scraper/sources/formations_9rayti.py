"""9rayti's directory of Bachelor, Master and Doctorat programmes.

Unlike ``/concoursa`` announcements, these are durable programme pages rather
than time-limited calls. They deliberately have no deadline and are fetched
listing-only: detail pages are useful reading, but would turn each daily run
into hundreds of requests without adding reliably normalised fields.

robots.txt is ``User-agent: * / Allow: /``. Checked 2026-08-27.
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

from ..models import Opportunity, OpportunityType
from ..normalize import classify_domains, clean_text
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

    def scrape(self) -> Iterator[Opportunity]:
        max_pages = int(self.options.get("pages") or self.DEFAULT_PAGES)
        max_items = self.options.get("max_items")
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
