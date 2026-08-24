"""Configuration for the notifier."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]

load_dotenv(REPO_ROOT / ".env")
load_dotenv(REPO_ROOT / "notifier" / ".env", override=True)


@dataclass(frozen=True)
class Settings:
    database_url: str | None
    resend_api_key: str | None
    from_address: str
    site_url: str
    #: Hard ceiling per run, so a bad query cannot mail everyone repeatedly.
    max_emails_per_run: int
    #: Never send more than this to one person in a single run.
    max_emails_per_user: int

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            database_url=os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL"),
            resend_api_key=os.getenv("RESEND_API_KEY"),
            from_address=os.getenv(
                "NOTIFIER_FROM", "Tremplin <alerts@example.com>"
            ),
            site_url=os.getenv("SITE_URL", "http://localhost:3000").rstrip("/"),
            max_emails_per_run=int(os.getenv("NOTIFIER_MAX_EMAILS", "200")),
            max_emails_per_user=int(os.getenv("NOTIFIER_MAX_PER_USER", "1")),
        )


settings = Settings.from_env()
