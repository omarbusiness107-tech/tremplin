"""Orientation Chabab education opportunities from its RSS and article pages.

robots.txt allows normal access and declares search indexing permitted. The
scraper stores short excerpts and links back to the source. Checked 2026-08-28.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from collections.abc import Iterator
from datetime import datetime
from email.utils import parsedate_to_datetime
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from ..models import Opportunity
from ..normalize import classify_domains, clean_text
from ..registry import register
from ._community import (
    city_from_text,
    conditions_from_html,
    deadline_from_html,
    description_from_html,
    direct_application_link,
    institution_from_metadata,
    is_non_applicable,
    opportunity_type_from_text,
    positions_from_text,
)
from ._nine_rayti import entry_level_for_type
from .base import BaseScraper


class LayoutChanged(RuntimeError):
    """The RSS or article layout no longer exposes opportunity content."""


@register
class OrientationChababScraper(BaseScraper):
    key = "orientation_chabab"
    name = "Orientation Chabab"
    homepage_url = "https://orientation-chabab.com"
    robots_note = (
        "robots.txt allows all paths and permits search indexing; articles are stored as "
        "short normalized excerpts with source links. Checked 2026-08-28."
    )
    FEED_PATH = "/feed/"

    def scrape(self) -> Iterator[Opportunity]:
        max_items = self.options.get("max_items")
        fetch_details = self.options.get("fetch_details", True)
        feed_url = f"{self.homepage_url}{self.FEED_PATH}"
        try:
            root = ET.fromstring(self.http.get_text(feed_url))
        except ET.ParseError as exc:
            raise LayoutChanged(f"invalid RSS at {feed_url}: {exc}") from exc

        items = root.findall("./channel/item")
        if not items:
            raise LayoutChanged(f"no RSS items found at {feed_url}")

        emitted = 0
        for item in items:
            try:
                opportunity = self._parse_item(item, fetch_details=fetch_details)
            except Exception as exc:
                self.warn(f"could not parse an RSS item: {exc}")
                continue
            if opportunity is None:
                continue
            yield opportunity
            emitted += 1
            if max_items and emitted >= max_items:
                return

    def _parse_item(self, item: ET.Element, *, fetch_details: bool) -> Opportunity | None:
        title = clean_text(item.findtext("title"))
        article_url = clean_text(item.findtext("link"))
        if not title or not article_url or is_non_applicable(title):
            return None

        description_html = item.findtext("description") or ""
        detail_html = self.http.get_text(article_url) if fetch_details else description_html
        detail_soup = BeautifulSoup(detail_html, "lxml")
        article = (
            detail_soup.select_one("#article1") or detail_soup.select_one("article")
            if fetch_details
            else None
        )
        article_html = str(article) if article else detail_html

        institution_node = article.select_one("a[href*='/ecole/']") if article else None
        institution = (
            clean_text(institution_node.get_text(" ", strip=True))
            if institution_node
            else institution_from_metadata(title)
        )
        opportunity_type = opportunity_type_from_text(title)
        description = description_from_html(article_html)
        published = None
        if value := clean_text(item.findtext("pubDate")):
            try:
                published = parsedate_to_datetime(value).date()
            except (TypeError, ValueError):
                try:
                    published = datetime.fromisoformat(value.replace("Z", "+00:00")).date()
                except ValueError:
                    published = None

        external_id = urlparse(article_url).path.strip("/").replace("/", ":")
        return Opportunity(
            source_key=self.key,
            external_id=external_id,
            application_link=direct_application_link(
                article_html,
                article_url=article_url,
                homepage_url=self.homepage_url,
            ),
            title=title,
            type=opportunity_type,
            institution=institution,
            domains=classify_domains(title, institution, description),
            location_city=city_from_text(title, institution),
            conditions_to_apply=conditions_from_html(article_html),
            required_education_level=entry_level_for_type(opportunity_type),
            positions_available=positions_from_text(f"{title} {description or ''}"),
            deadline=deadline_from_html(article_html),
            published_at=published,
            description=description,
        )
