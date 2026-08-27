"""MonCallCenter (moncallcenter.ma) -- call-centre and BPO jobs.

The largest Moroccan job board for the call-centre sector, which employs a
very large share of the young French- and Spanish-speaking workforce. It
was chosen as the second source because it exercises a different shape of
opportunity from the concours portal: rolling job adverts with **no
deadline**, a required-languages list, city-level location, and free prose
rather than label/value pairs.

robots.txt (checked 2026-08-24) has a `User-Agent: *` group that disallows
`/contact.php`, `/cgu.php`, `/docs/` and a handful of individual employer
sub-paths. The general listing and offer pages this scraper reads are
permitted, and PoliteSession re-checks on every request.
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

from ..models import Opportunity, OpportunityType
from ..normalize import classify_domains, clean_text, fold, parse_french_date
from ..registry import register
from .base import BaseScraper

# /offre-emploi/{company}-{slug}-{id} — the trailing integer is the stable id.
OFFER_PATH_RE = re.compile(r"/offre-emploi/(?P<slug>[^/?#]*?)-(?P<id>\d+)/?$")

# Languages the board actually filters on; anything else is kept verbatim.
# The board uses "Maroc" for a nationwide or unspecified posting. Storing
# that as a city would put a country into the city filter.
NOT_A_CITY = {"maroc", "morocco", "tout le maroc", "national"}

KNOWN_LANGUAGES = {
    "francais": "Français",
    "anglais": "Anglais",
    "arabe": "Arabe",
    "espagnol": "Espagnol",
    "italien": "Italien",
    "allemand": "Allemand",
    "neerlandais": "Néerlandais",
    "portugais": "Portugais",
}

# Use the advert's title only. A normal job description often says that a
# previous internship counts as experience; classifying from that prose would
# incorrectly turn a permanent job into an internship.
INTERNSHIP_TITLE_MARKERS = ("stage", "stagiaire", "internship", "pfe", "pre-embauche")


class LayoutChanged(RuntimeError):
    """The listing page no longer looks like we expect."""


@register
class MonCallCenterScraper(BaseScraper):
    key = "moncallcenter"
    name = "MonCallCenter"
    homepage_url = "https://www.moncallcenter.ma"
    robots_note = (
        "robots.txt allows the offers listing; only /contact.php, /cgu.php, /docs/ "
        "and some employer sub-paths are disallowed. Checked 2026-08-24."
    )

    LISTING_PATH = "/offres-emploi/"
    DEFAULT_PAGES = 3

    # Detail-page section headings, folded.
    SECTION_DESCRIPTION = "descriptif du poste"
    SECTION_PROFILE = "profil recherche"

    def scrape(self) -> Iterator[Opportunity]:
        max_pages = int(self.options.get("pages") or self.DEFAULT_PAGES)
        max_items = self.options.get("max_items")
        fetch_details = self.options.get("fetch_details", True)

        emitted = 0
        for page in range(1, max_pages + 1):
            # Page 1 is the bare path; later pages append the number.
            path = self.LISTING_PATH if page == 1 else f"{self.LISTING_PATH}{page}/"
            url = urljoin(self.homepage_url, path)
            self.log.info("listing page %s: %s", page, url)
            soup = BeautifulSoup(self.http.get_text(url), "lxml")

            cards = self._listing_cards(soup)
            if not cards:
                if page == 1:
                    raise LayoutChanged(
                        f"no offer cards found on {url} - the listing markup probably changed"
                    )
                self.log.info("page %s is empty, stopping", page)
                break

            for card in cards:
                try:
                    opportunity = self._parse_card(card)
                except Exception as exc:
                    self.warn(f"could not parse an offer card on page {page}: {exc}")
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
        container = soup.select_one("#statuts")
        if container is None:
            return []
        return container.select("div.offres")

    def _parse_card(self, card: Tag) -> Opportunity | None:
        """Parse one card.

        Sponsored offers are re-listed further down the same page as normal
        ones. Both are kept: they carry the same id, so the store's
        (source_key, external_id) match collapses them, and dropping either
        risks losing an offer that is only ever shown in one of the two
        positions.
        """
        link = card.select_one('h2 a[href*="/offre-emploi/"]')
        if link is None:
            return None

        match = OFFER_PATH_RE.search(link.get("href", ""))
        if not match:
            self.warn(f"unrecognised offer URL: {link.get('href')!r}")
            return None

        title = clean_text(link.get_text(" ", strip=True))
        if not title:
            self.warn(f"offer {match['id']} has no title")
            return None

        published_at, activity, city = self._parse_meta(card)

        return Opportunity(
            source_key=self.key,
            external_id=match["id"],
            application_link=urljoin(self.homepage_url, link["href"]),
            title=title,
            type=(
                OpportunityType.INTERNSHIP
                if any(marker in fold(title) for marker in INTERNSHIP_TITLE_MARKERS)
                else OpportunityType.JOB
            ),
            # The card's <img alt> names a different company from the one the
            # link points at, so the employer is read from the detail page.
            institution=None,
            domains=classify_domains(title),
            location_city=city,
            is_remote=bool(activity and "domicile" in fold(activity)),
            published_at=published_at,
            description=clean_text(self._text(card, "p")),
            attributes={"Activité": activity} if activity else {},
            # Job adverts here run until filled; no deadline is published.
            deadline=None,
        )

    def _parse_meta(self, card: Tag) -> tuple[object, str | None, str | None]:
        """Read `24-08-2026 | Emission | Casablanca` off a card.

        Sponsored cards replace the date with a label ("Offre de la
        semaine"), so the date is parsed rather than assumed by position.
        """
        meta = card.select_one(".divoffres span")
        if meta is None:
            return None, None, None

        parts = [clean_text(p) for p in meta.get_text("|", strip=True).split("|")]
        parts = [p for p in parts if p]
        if not parts:
            return None, None, None

        published_at = parse_french_date(parts[0])
        # City is the last <b>; activity is whatever sits between.
        bolds = [clean_text(b.get_text(" ", strip=True)) for b in meta.select("b")]
        city = bolds[-1] if bolds and (published_at or len(bolds) > 1) else None
        if city and (city == parts[0] or fold(city) in NOT_A_CITY):
            city = None

        middle = [p for p in parts[1:] if p != city]
        activity = middle[0] if middle else None
        return published_at, activity, city

    # -- detail ----------------------------------------------------------

    def _enrich_from_detail(self, opportunity: Opportunity) -> None:
        soup = BeautifulSoup(self.http.get_text(opportunity.application_link), "lxml")

        employer = soup.select_one("h1 ~ h2 a, h2 a[href^='/']")
        opportunity.institution = clean_text(employer.get_text(" ", strip=True)) if employer else None

        # The listing card's <img alt> names a different company from the
        # one its link points at, so the logo is taken from the detail
        # page, where the alt does match the employer heading. Anything
        # that does not match is the site's own branding, not the
        # employer's.
        if opportunity.institution:
            opportunity.institution_logo_url = self._employer_logo(soup, opportunity.institution)

        opportunity.languages_required = self._languages(soup)

        # Sponsored cards show "Offre de la semaine" where the date goes,
        # so the publication date is recovered here instead.
        if opportunity.published_at is None:
            opportunity.published_at = self._published_at(soup)

        sections = self._sections(soup)
        if not sections:
            self.warn(f"detail page for {opportunity.external_id} exposed no sections")
            return

        for heading, body in sections.items():
            folded = fold(heading)
            if folded == self.SECTION_DESCRIPTION:
                opportunity.description = body
            elif folded == self.SECTION_PROFILE:
                opportunity.conditions_to_apply = body

        # Anything the board publishes that has no column of its own
        # (working hours, salary band, …) stays available on the detail page.
        extras = {
            heading: body
            for heading, body in sections.items()
            if fold(heading) not in (self.SECTION_DESCRIPTION, self.SECTION_PROFILE)
        }
        opportunity.attributes = {**opportunity.attributes, **extras}

        if soup.select_one('img[alt*="xp" i][alt*="exig" i]'):
            opportunity.attributes["Expérience"] = "Exigée"

        opportunity.domains = classify_domains(
            opportunity.title, opportunity.institution, opportunity.description
        )

    def _employer_logo(self, soup: BeautifulSoup, employer: str) -> str | None:
        """The company logo, identified by its alt matching the employer."""
        wanted = fold(employer)
        for img in soup.select("img[src][alt]"):
            alt = fold(clean_text(img.get("alt")) or "")
            if alt and alt == wanted:
                return urljoin(self.homepage_url, img["src"])
        return None

    def _published_at(self, soup: BeautifulSoup):
        """Read the date out of the detail meta line.

        `23-08-2026 | Talk Lab - Casablanca`
        """
        for span in soup.select("span"):
            text = clean_text(span.get_text(" ", strip=True)) or ""
            if "|" not in text:
                continue
            if (parsed := parse_french_date(text.split("|")[0])) is not None:
                return parsed
        return None

    def _languages(self, soup: BeautifulSoup) -> list[str]:
        """Read the `Langue(s) :` list, whose links read `# Français`."""
        label = soup.find("b", string=re.compile(r"Langue", re.I))
        if label is None:
            return []

        container = label.parent
        languages: list[str] = []
        for anchor in container.select('a[href*="Lang="]'):
            text = clean_text(anchor.get_text(" ", strip=True)) or ""
            text = text.lstrip("# ").strip()
            if text:
                languages.append(KNOWN_LANGUAGES.get(fold(text), text))
        return languages

    def _sections(self, soup: BeautifulSoup) -> dict[str, str]:
        """`<h3>heading</h3><p>body</p>` blocks inside `.offredetails`."""
        sections: dict[str, str] = {}
        for block in soup.select(".offredetails"):
            for heading in block.select("h3"):
                label = clean_text(heading.get_text(" ", strip=True))
                if not label:
                    continue
                body_parts: list[str] = []
                for sibling in heading.find_next_siblings():
                    if sibling.name == "h3":
                        break
                    text = clean_text(sibling.get_text("\n", strip=True))
                    if text:
                        body_parts.append(text)
                body = "\n".join(body_parts)
                if body:
                    sections.setdefault(label, body)
        return sections

    @staticmethod
    def _text(node: Tag, selector: str) -> str | None:
        found = node.select_one(selector)
        return found.get_text(" ", strip=True) if found else None
