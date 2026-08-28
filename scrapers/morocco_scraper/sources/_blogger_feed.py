"""Reusable Blogger JSON-feed scraper for Moroccan opportunity sites."""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import ClassVar
from urllib.parse import urlencode, urljoin, urlparse

from ..models import Opportunity, OpportunityType
from ..normalize import classify_domains, clean_text
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
    published_date,
)
from ._nine_rayti import entry_level_for_type
from .base import BaseScraper


class LayoutChanged(RuntimeError):
    """The public Blogger feed no longer has its documented structure."""


class BloggerFeedScraper(BaseScraper):
    """Read recent posts through Blogger's stable public JSON feed."""

    DEFAULT_PAGES = 3
    PAGE_SIZE = 25
    DEFAULT_TYPE: ClassVar[OpportunityType | None] = None
    USE_CATEGORY_INSTITUTION = True
    robots_note = (
        "robots.txt allows all paths except /search; the public /feeds endpoint is allowed. "
        "Checked 2026-08-28."
    )

    def scrape(self) -> Iterator[Opportunity]:
        max_pages = int(self.options.get("pages") or self.DEFAULT_PAGES)
        max_items = self.options.get("max_items")
        emitted = 0

        for page in range(1, max_pages + 1):
            start = (page - 1) * self.PAGE_SIZE + 1
            query = urlencode(
                {"alt": "json", "max-results": self.PAGE_SIZE, "start-index": start}
            )
            url = urljoin(self.homepage_url, f"/feeds/posts/default?{query}")
            self.log.info("feed page %s: %s", page, url)
            try:
                payload = json.loads(self.http.get_text(url))
            except (json.JSONDecodeError, TypeError) as exc:
                raise LayoutChanged(f"invalid Blogger JSON feed at {url}: {exc}") from exc

            entries = payload.get("feed", {}).get("entry", [])
            if not isinstance(entries, list):
                raise LayoutChanged(f"Blogger feed entries are not a list at {url}")
            if not entries:
                if page == 1:
                    raise LayoutChanged(f"no posts found in Blogger feed at {url}")
                break

            for entry in entries:
                try:
                    opportunity = self._parse_entry(entry)
                except Exception as exc:
                    self.warn(f"could not parse a feed post on page {page}: {exc}")
                    continue
                if opportunity is None:
                    continue
                yield opportunity
                emitted += 1
                if max_items and emitted >= max_items:
                    return

            if len(entries) < self.PAGE_SIZE:
                break

    def _parse_entry(self, entry: dict) -> Opportunity | None:
        title = clean_text(entry.get("title", {}).get("$t"))
        if not title or is_non_applicable(title):
            return None

        article_url = next(
            (
                link.get("href")
                for link in entry.get("link", [])
                if link.get("rel") == "alternate" and link.get("href")
            ),
            None,
        )
        if not article_url:
            raise ValueError("feed post has no alternate article URL")

        categories = [
            value
            for category in entry.get("category", [])
            if (value := clean_text(category.get("term")))
        ]
        html = entry.get("content", {}).get("$t") or entry.get("summary", {}).get("$t")
        opportunity_type = opportunity_type_from_text(title, categories, self.DEFAULT_TYPE)
        institution = (
            institution_from_metadata(title, categories)
            if self.USE_CATEGORY_INSTITUTION
            else None
        )
        description = description_from_html(html)

        path = urlparse(article_url).path.strip("/")
        external_id = path.removesuffix(".html").replace("/", ":")
        if not external_id:
            raise ValueError("feed post URL has no stable path")

        return Opportunity(
            source_key=self.key,
            external_id=external_id,
            application_link=direct_application_link(
                html,
                article_url=article_url,
                homepage_url=self.homepage_url,
            ),
            title=title,
            type=opportunity_type,
            institution=institution,
            domains=classify_domains(title, institution, description),
            location_city=city_from_text(title, *categories),
            conditions_to_apply=conditions_from_html(html),
            required_education_level=entry_level_for_type(opportunity_type),
            positions_available=positions_from_text(f"{title} {description or ''}"),
            deadline=deadline_from_html(html),
            published_at=published_date(entry.get("published", {}).get("$t")),
            description=description,
            attributes={"Feed categories": ", ".join(categories)} if categories else {},
        )
