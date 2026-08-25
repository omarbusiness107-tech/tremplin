"""Base class every source module subclasses."""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from collections.abc import Iterator

from ..http_client import PoliteSession
from ..models import Opportunity


class BaseScraper(ABC):
    """One scraper per site.

    Subclasses declare their identity as class attributes and implement
    `scrape()`. Everything else -- politeness, dedup, persistence, run
    bookkeeping -- is handled by the pipeline, so a new source is one file.

    A scraper's job is to yield whatever it could parse. Per-item failures
    should be caught inside `scrape()` and reported via `self.warn()`; only
    a failure that makes the whole source unusable (listing page gone,
    layout unrecognisable) should propagate as an exception.
    """

    key: str = ""
    name: str = ""
    homepage_url: str = ""
    #: Human note on why crawling this site is permitted.
    robots_note: str = ""

    def __init__(self, http: PoliteSession, options: dict | None = None) -> None:
        self.http = http
        self.options = options or {}
        self.warnings: list[str] = []
        self.log = logging.getLogger(f"scraper.{self.key or type(self).__name__}")

    @abstractmethod
    def scrape(self) -> Iterator[Opportunity]:
        """Yield every opportunity currently listed on the source."""

    def warn(self, message: str) -> None:
        """Record a non-fatal parsing problem.

        Warnings land on the run row, which is how the admin page shows a
        source degrading before it breaks outright.
        """
        self.log.warning(message)
        # Cap it: a systematically broken selector would otherwise write
        # thousands of near-identical strings into the run row.
        if len(self.warnings) < 50:
            self.warnings.append(message)
