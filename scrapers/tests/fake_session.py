"""A stand-in for PoliteSession that serves fixtures instead of requests.

Shared by every scraper test: tests must never touch the network, so a
scraper that starts failing live keeps passing here. That is the point --
these pin the parsing rules, and `source_health` catches live drift.
"""

from __future__ import annotations


class FakeSession:
    def __init__(self, pages: dict[str, str]):
        self.pages = pages
        self.requested: list[str] = []
        self.pages_fetched = 0

    def get_text(self, url: str) -> str:
        """Serve the fixture whose key matches this URL most specifically.

        Longest match rather than first match: real listing and detail
        paths often share a prefix (`/bourses` and `/bourse/{slug}`, where
        the slug itself starts with "bourses"), and first-match would hand
        back the listing page for a detail request.
        """
        self.requested.append(url)
        matches = [(len(f), b) for f, b in self.pages.items() if f in url]
        if not matches:
            raise AssertionError(f"unexpected request: {url}")
        self.pages_fetched += 1
        return max(matches)[1]

    def close(self) -> None:
        pass
