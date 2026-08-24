"""A deliberately slow, well-behaved HTTP client.

Three things every scraper gets for free:

* robots.txt is fetched once per host and consulted before every request;
  a disallowed URL raises rather than being fetched.
* requests to the same host are spaced by at least `delay` seconds.
* transient failures (5xx, 429, connection resets) are retried with
  exponential backoff; 4xx is not retried, because it will not fix itself.
"""

from __future__ import annotations

import logging
import random
import time
import urllib.robotparser
from urllib.parse import urljoin, urlparse

import requests

from .config import settings

log = logging.getLogger(__name__)


class RobotsDisallowed(RuntimeError):
    """The site's robots.txt forbids this path for our user agent."""


class FetchError(RuntimeError):
    """The request failed after exhausting retries."""


class PoliteSession:
    def __init__(
        self,
        *,
        user_agent: str | None = None,
        delay: float | None = None,
        timeout: float | None = None,
        max_retries: int | None = None,
        respect_robots: bool | None = None,
    ) -> None:
        self.user_agent = user_agent or settings.user_agent
        self.delay = settings.request_delay if delay is None else delay
        self.timeout = settings.request_timeout if timeout is None else timeout
        self.max_retries = settings.max_retries if max_retries is None else max_retries
        self.respect_robots = (
            settings.respect_robots if respect_robots is None else respect_robots
        )

        self.pages_fetched = 0
        self._last_request_at: dict[str, float] = {}
        self._robots: dict[str, urllib.robotparser.RobotFileParser | None] = {}

        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": self.user_agent,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8,ar;q=0.7",
            }
        )

    # -- robots ----------------------------------------------------------

    def _robots_for(self, url: str) -> urllib.robotparser.RobotFileParser | None:
        origin = "{0.scheme}://{0.netloc}".format(urlparse(url))
        if origin in self._robots:
            return self._robots[origin]

        parser = urllib.robotparser.RobotFileParser()
        robots_url = urljoin(origin, "/robots.txt")
        try:
            response = self.session.get(robots_url, timeout=self.timeout)
            if response.status_code >= 400:
                # No robots.txt is an implicit allow-all.
                log.info("no robots.txt at %s (HTTP %s)", robots_url, response.status_code)
                parser = None
            else:
                parser.parse(response.text.splitlines())
                log.info("loaded robots.txt from %s", robots_url)
        except requests.RequestException as exc:
            # Unreachable robots.txt: stay on the safe side and refuse.
            log.warning("could not read %s (%s) - treating host as disallowed", robots_url, exc)
            self._robots[origin] = _DENY_ALL
            return _DENY_ALL

        self._robots[origin] = parser
        return parser

    def can_fetch(self, url: str) -> bool:
        if not self.respect_robots:
            return True
        parser = self._robots_for(url)
        if parser is None:
            return True
        return parser.can_fetch(self.user_agent, url)

    def crawl_delay_for(self, url: str) -> float:
        """robots.txt Crawl-delay wins whenever it is stricter than ours."""
        parser = self._robots_for(url) if self.respect_robots else None
        if parser is None:
            return self.delay
        try:
            declared = parser.crawl_delay(self.user_agent)
        except Exception:  # older parsers raise on malformed directives
            declared = None
        return max(self.delay, float(declared)) if declared else self.delay

    # -- fetching --------------------------------------------------------

    def _wait_turn(self, url: str) -> None:
        host = urlparse(url).netloc
        required = self.crawl_delay_for(url)
        last = self._last_request_at.get(host)
        if last is not None:
            # A little jitter so we never look like a metronome.
            elapsed = time.monotonic() - last
            remaining = required + random.uniform(0, 0.3) - elapsed
            if remaining > 0:
                time.sleep(remaining)
        self._last_request_at[host] = time.monotonic()

    def get(self, url: str, **kwargs) -> requests.Response:
        if not self.can_fetch(url):
            raise RobotsDisallowed(f"robots.txt disallows {url} for {self.user_agent!r}")

        last_error: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            self._wait_turn(url)
            try:
                response = self.session.get(url, timeout=self.timeout, **kwargs)
            except requests.RequestException as exc:
                last_error = exc
            else:
                if response.status_code < 400:
                    self.pages_fetched += 1
                    return response
                if response.status_code in (429, 500, 502, 503, 504):
                    last_error = FetchError(f"HTTP {response.status_code} for {url}")
                else:
                    # 404/403 will not improve on retry.
                    raise FetchError(f"HTTP {response.status_code} for {url}")

            if attempt < self.max_retries:
                backoff = 2 ** attempt
                log.warning(
                    "fetch failed (%s/%s) for %s: %s - retrying in %ss",
                    attempt, self.max_retries, url, last_error, backoff,
                )
                time.sleep(backoff)

        raise FetchError(f"giving up on {url} after {self.max_retries} attempts: {last_error}")

    def get_text(self, url: str, **kwargs) -> str:
        response = self.get(url, **kwargs)
        # Moroccan sites often omit the charset; the pages are UTF-8.
        if not response.encoding or response.encoding.lower() == "iso-8859-1":
            response.encoding = response.apparent_encoding or "utf-8"
        return response.text

    def close(self) -> None:
        self.session.close()

    def __enter__(self) -> "PoliteSession":
        return self

    def __exit__(self, *exc_info) -> None:
        self.close()


class _DenyAll(urllib.robotparser.RobotFileParser):
    def can_fetch(self, useragent: str, url: str) -> bool:  # noqa: D102
        return False


_DENY_ALL = _DenyAll()
