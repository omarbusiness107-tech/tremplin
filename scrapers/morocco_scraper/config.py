"""Runtime configuration, read once from the environment.

The scraper connects to Postgres directly rather than through PostgREST:
it is a batch job that needs upserts and transactions, and Supabase hands
out a normal connection string for exactly this. Use the *service role*
connection (the one under Project Settings -> Database), which bypasses
RLS -- ingestion is the only writer of `opportunities`.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]

# .env in scrapers/ wins over one at the repo root, so a local override does
# not require touching the shared file.
load_dotenv(REPO_ROOT / ".env")
load_dotenv(REPO_ROOT / "scrapers" / ".env", override=True)

DEFAULT_USER_AGENT = (
    "MoroccoOpportunitiesBot/0.1 "
    "(+https://github.com/omarbusiness107-tech/cli-game-; aggregates public "
    "opportunity listings for students and job seekers in Morocco)"
)


@dataclass(frozen=True)
class Settings:
    database_url: str | None
    user_agent: str
    request_timeout: float
    request_delay: float
    max_retries: int
    respect_robots: bool

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            database_url=os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL"),
            user_agent=os.getenv("SCRAPER_USER_AGENT", DEFAULT_USER_AGENT),
            request_timeout=float(os.getenv("SCRAPER_TIMEOUT", "30")),
            request_delay=float(os.getenv("SCRAPER_DELAY", "2.0")),
            max_retries=int(os.getenv("SCRAPER_MAX_RETRIES", "3")),
            # Only ever set false for a site whose owner has given written
            # permission to crawl paths robots.txt disallows.
            respect_robots=os.getenv("SCRAPER_RESPECT_ROBOTS", "true").lower()
            not in {"0", "false", "no"},
        )


settings = Settings.from_env()
