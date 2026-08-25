"""Command line entry point.

    python -m morocco_notifier send --kind new_match --dry-run
    python -m morocco_notifier send --all
"""

from __future__ import annotations

import argparse
import logging
import sys

import psycopg

from .config import settings
from .email import ConsoleMailer, Mailer, ResendMailer
from .models import RunStats
from .runner import run

KINDS = ("new_match", "deadline_reminder")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="morocco_notifier",
        description="Email users about new matches and approaching deadlines.",
    )
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)

    send = sub.add_parser("send", help="send notifications")
    target = send.add_mutually_exclusive_group(required=True)
    target.add_argument("--kind", choices=KINDS)
    target.add_argument("--all", action="store_true", help="every kind")
    send.add_argument(
        "--dry-run",
        action="store_true",
        help="print the emails instead of sending them, and record nothing",
    )
    send.add_argument(
        "--lookback-hours",
        type=int,
        default=26,
        help="how far back a listing counts as new (default: 26, one day plus slack)",
    )
    send.add_argument("--max-emails", type=int, help="cap for this run")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    if not settings.database_url:
        print("DATABASE_URL is not set.", file=sys.stderr)
        return 1

    mailer: Mailer
    if args.dry_run:
        mailer = ConsoleMailer()
    elif not settings.resend_api_key:
        print(
            "RESEND_API_KEY is not set. Pass --dry-run to preview the emails instead.",
            file=sys.stderr,
        )
        return 1
    else:
        mailer = ResendMailer(settings.resend_api_key, settings.from_address)

    kinds = list(KINDS) if args.all else [args.kind]
    results: list[RunStats] = []

    with psycopg.connect(settings.database_url) as conn:
        for kind in kinds:
            stats = run(
                conn,
                mailer,
                kind=kind,
                site_url=settings.site_url,
                max_emails=args.max_emails or settings.max_emails_per_run,
                lookback_hours=args.lookback_hours,
            )
            results.append(stats)

            if args.dry_run:
                # Nothing should persist from a preview.
                conn.rollback()
            else:
                conn.commit()

    print()
    print(f"{'kind':<20} {'users':>6} {'sent':>6} {'failed':>7} {'items':>6}")
    print("-" * 50)
    for stats in results:
        print(
            f"{stats.kind:<20} {stats.users_considered:>6} {stats.emails_sent:>6} "
            f"{stats.emails_failed:>7} {stats.opportunities_notified:>6}"
        )
    if args.dry_run:
        print("\n(dry run - nothing sent, nothing recorded)")

    return 1 if any(s.emails_failed and not s.emails_sent for s in results) else 0
