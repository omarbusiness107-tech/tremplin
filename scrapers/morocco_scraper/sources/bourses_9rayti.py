"""9rayti.com -- scholarship announcements (bourses).

Morocco's main student orientation portal. Chosen as the third source
because it adds the one opportunity type the first two do not cover --
scholarships, most of them for study abroad -- and because its listings
are dated announcements rather than structured records, which is the
shape most education sources take.

robots.txt (checked 2026-08-24) is `User-agent: * / Allow: /`.

A warning to anyone maintaining this: the deadline on a detail page is
published twice, and the visible one is wrong. See `_deadline`.
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from datetime import datetime
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

from ..models import Opportunity, OpportunityType
from ..normalize import MOROCCO_TZ, classify_domains, clean_text, fold
from ..registry import register
from .base import BaseScraper

BOURSE_PATH_RE = re.compile(r"^/bourse/(?P<slug>[a-z0-9\-]+)/?$")

# The static placeholder baked into the countdown template. If this ever
# turns up as a parsed deadline, the parsing is reading the wrong element.
PLACEHOLDER_DEADLINE = "14/10/2025"


class LayoutChanged(RuntimeError):
    """The listing page no longer looks like we expect."""


@register
class Bourses9raytiScraper(BaseScraper):
    key = "bourses_9rayti"
    name = "9rayti.com — Bourses"
    homepage_url = "https://www.9rayti.com"
    robots_note = "robots.txt is `User-agent: * / Allow: /`. Checked 2026-08-24."

    LISTING_PATH = "/bourses"
    DEFAULT_PAGES = 3

    # Headings that describe who may apply rather than what is on offer.
    CONDITION_HEADINGS = ("condition", "eligib", "criter", "profil", "qui peut")

    def scrape(self) -> Iterator[Opportunity]:
        max_pages = int(self.options.get("pages") or self.DEFAULT_PAGES)
        max_items = self.options.get("max_items")
        fetch_details = self.options.get("fetch_details", True)

        emitted = 0
        for page in range(1, max_pages + 1):
            url = urljoin(self.homepage_url, self.LISTING_PATH)
            if page > 1:
                url = f"{url}?page={page}"
            self.log.info("listing page %s: %s", page, url)
            soup = BeautifulSoup(self.http.get_text(url), "lxml")

            cards = self._listing_cards(soup)
            if not cards:
                if page == 1:
                    raise LayoutChanged(
                        f"no scholarship cards found on {url} - the listing markup changed"
                    )
                self.log.info("page %s is empty, stopping", page)
                break

            for card in cards:
                try:
                    opportunity = self._parse_card(card)
                except Exception as exc:
                    self.warn(f"could not parse a card on page {page}: {exc}")
                    continue
                if opportunity is None:
                    continue

                if fetch_details:
                    try:
                        self._enrich_from_detail(opportunity)
                    except Exception as exc:
                        self.warn(f"detail fetch failed for {opportunity.external_id}: {exc}")

                yield opportunity
                emitted += 1
                if max_items and emitted >= max_items:
                    self.log.info("reached max_items=%s", max_items)
                    return

    # -- listing ---------------------------------------------------------

    def _listing_cards(self, soup: BeautifulSoup) -> list[Tag]:
        """Cards in the results grid only.

        The site-wide navigation overlay also links to /bourse/ pages;
        scoping to the grid keeps those out of the result set.
        """
        grid = soup.select_one("div.list-grid-2")
        if grid is None:
            return []
        return [
            a for a in grid.select('a[href^="/bourse/"]') if BOURSE_PATH_RE.match(a.get("href", ""))
        ]

    def _parse_card(self, card: Tag) -> Opportunity | None:
        match = BOURSE_PATH_RE.match(card.get("href", ""))
        if not match:
            return None

        title = clean_text(self._text(card, "h2")) or clean_text(card.get_text(" ", strip=True))
        if not title:
            self.warn(f"card {match['slug']} has no title")
            return None

        image = card.select_one("img[src]")

        return Opportunity(
            source_key=self.key,
            # The slug is stable and unique; the site exposes no numeric id.
            external_id=match["slug"],
            application_link=urljoin(self.homepage_url, card["href"]),
            title=title,
            type=OpportunityType.SCHOLARSHIP,
            # These announcements name the awarding body only in prose, and
            # guessing it from the thumbnail filename would be worse than
            # leaving it out. The detail page link carries the real source.
            institution=None,
            institution_logo_url=image["src"] if image else None,
            domains=classify_domains(title),
        )

    # -- detail ----------------------------------------------------------

    def _enrich_from_detail(self, opportunity: Opportunity) -> None:
        soup = BeautifulSoup(self.http.get_text(opportunity.application_link), "lxml")

        opportunity.deadline = self._deadline(soup, opportunity.external_id)

        body = self._article_body(soup)
        if body is None:
            self.warn(f"no article body found for {opportunity.external_id}")
            return

        sections = self._sections(body)
        intro = self._intro(body)

        conditions = [
            f"{heading}\n{text}"
            for heading, text in sections.items()
            if any(word in fold(heading) for word in self.CONDITION_HEADINGS)
        ]
        if conditions:
            opportunity.conditions_to_apply = "\n\n".join(conditions)

        opportunity.description = intro or "\n\n".join(
            f"{heading}\n{text}" for heading, text in sections.items()
        ) or None

        opportunity.attributes = {
            heading: text
            for heading, text in sections.items()
            if not any(word in fold(heading) for word in self.CONDITION_HEADINGS)
        }

        opportunity.domains = classify_domains(opportunity.title, opportunity.description)

    def _deadline(self, soup: BeautifulSoup, external_id: str) -> datetime | None:
        """Read the deadline from the countdown's `data-target-date`.

        The detail page prints the deadline twice and **the visible one is
        wrong**: `.target-date-display` and `.expired-date` both contain a
        hard-coded placeholder that the site's JavaScript overwrites at
        runtime from `data-target-date`. Checked across six listings, the
        attribute varied per page while the rendered text was identical on
        every one of them.

        Scraping what a person sees in a browser would therefore give every
        scholarship the same wrong date -- and since the deadline drives
        sorting, urgency colouring and email alerts, that failure would be
        both total and silent.
        """
        countdown = soup.select_one("[data-target-date]")
        if countdown is None:
            self.warn(f"no countdown element on {external_id}; deadline unknown")
            return None

        raw = clean_text(countdown.get("data-target-date"))
        if not raw:
            return None

        try:
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            self.warn(f"unparseable data-target-date {raw!r} on {external_id}")
            return None

        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=MOROCCO_TZ)

        # Tripwire: if the attribute ever starts carrying the placeholder,
        # the site has changed and the deadline is no longer trustworthy.
        displayed = clean_text(self._text(soup, ".target-date-display"))
        if displayed and displayed != PLACEHOLDER_DEADLINE:
            expected = f"{parsed.day:02d}/{parsed.month:02d}/{parsed.year}"
            if displayed != expected:
                self.warn(
                    f"{external_id}: countdown attribute {parsed.date()} disagrees with "
                    f"displayed {displayed!r} - re-check which one the site now honours"
                )

        return parsed

    def _article_body(self, soup: BeautifulSoup) -> Tag | None:
        """Find the prose container.

        The site uses utility CSS class names, which churn, so a specific
        selector is tried first and a structural fallback picks the densest
        block of prose outside the chrome. The fallback records a warning:
        if it starts firing, the selector below needs updating.
        """
        primary = soup.select_one("div.mt-md.d-flex.flex-column.gap-lg.px-lg")
        if primary is not None:
            return primary

        for tag in soup(["nav", "header", "footer", "script", "style", "aside"]):
            tag.decompose()

        best, best_len = None, 0
        for div in soup.select("div"):
            if len(div.select("p")) < 2 or div.select("div p"):
                continue  # keep to the innermost container of the prose
            length = len(div.get_text(" ", strip=True))
            if length > best_len:
                best, best_len = div, length

        if best is not None and best_len > 300:
            self.warn("article body found by fallback; the primary selector needs updating")
            return best
        return None

    def _sections(self, body: Tag) -> dict[str, str]:
        """`<h2>/<h3>` headings and the prose that follows each."""
        sections: dict[str, str] = {}
        for heading in body.select("h2, h3"):
            label = clean_text(heading.get_text(" ", strip=True))
            if not label:
                continue
            parts: list[str] = []
            for sibling in heading.find_next_siblings():
                if sibling.name in ("h2", "h3"):
                    break
                text = clean_text(sibling.get_text(" ", strip=True))
                if text:
                    parts.append(text)
            if parts:
                sections.setdefault(label, "\n".join(parts))
        return sections

    def _intro(self, body: Tag) -> str | None:
        """The prose before the first heading -- what the award actually is."""
        parts: list[str] = []
        for child in body.children:
            if getattr(child, "name", None) in ("h2", "h3"):
                break
            text = clean_text(child.get_text(" ", strip=True)) if hasattr(child, "get_text") else None
            if text:
                parts.append(text)
        return "\n".join(parts) or None

    @staticmethod
    def _text(node: Tag, selector: str) -> str | None:
        found = node.select_one(selector)
        return found.get_text(" ", strip=True) if found else None
