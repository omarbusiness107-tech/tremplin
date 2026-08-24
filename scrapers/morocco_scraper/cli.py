"""Command line entry point.

    python -m morocco_scraper list
    python -m morocco_scraper run --source emploi_public --dry-run
    python -m morocco_scraper run --all
    python -m morocco_scraper refresh-status
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from .config import settings
from .models import RunStats
from .pipeline import ingest
from .registry import load_all
from .store import DryRunStore, PostgresStore, Store


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="morocco_scraper",
        description="Ingest Moroccan opportunity listings into the tracker database.",
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="debug logging")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("list", help="list registered sources")

    run = sub.add_parser("run", help="scrape one or more sources")
    target = run.add_mutually_exclusive_group(required=True)
    target.add_argument("--source", action="append", metavar="KEY", help="repeatable")
    target.add_argument("--all", action="store_true", help="run every registered source")
    run.add_argument(
        "--pages", type=int, help="listing pages per source (default: the source's own)"
    )
    run.add_argument("--max-items", type=int, help="stop after this many items per source")
    run.add_argument(
        "--no-details",
        action="store_true",
        help="skip detail pages: far fewer requests, less complete rows",
    )
    run.add_argument(
        "--include-all-stages",
        action="store_true",
        help="keep follow-up notices (convocations, results), not just open calls",
    )
    run.add_argument(
        "--dry-run",
        action="store_true",
        help="parse and normalize without touching the database",
    )
    run.add_argument("--out", type=Path, metavar="FILE", help="write scraped rows to JSON")

    sub.add_parser("refresh-status", help="re-derive open / closing soon / closed from deadlines")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    if args.command == "list":
        return _cmd_list()
    if args.command == "run":
        return _cmd_run(args)
    if args.command == "refresh-status":
        return _cmd_refresh()
    return 2


def _cmd_list() -> int:
    scrapers = load_all()
    if not scrapers:
        print("No scrapers registered.")
        return 0
    width = max(len(k) for k in scrapers)
    for key, cls in sorted(scrapers.items()):
        print(f"{key:<{width}}  {cls.name}  {cls.homepage_url}")
    return 0


def _cmd_run(args) -> int:
    options = {
        "pages": args.pages,
        "max_items": args.max_items,
        "fetch_details": not args.no_details,
        "include_all_stages": args.include_all_stages,
    }

    store: Store
    if args.dry_run:
        store = DryRunStore()
    else:
        if not settings.database_url:
            print(
                "DATABASE_URL is not set. Copy .env.example to .env and point it at your "
                "Supabase database, or pass --dry-run to parse without storing.",
                file=sys.stderr,
            )
            return 1
        store = PostgresStore(settings.database_url)

    try:
        results = ingest(
            store, source_keys=None if args.all else args.source, options=options
        )
        if args.out is not None:
            _write_json(args.out, store, results)
    finally:
        store.close()

    _print_report(results, dry_run=args.dry_run)
    # Non-zero only if every source failed: a partial run is still useful.
    return 1 if results and all(r.status == "failed" for r in results) else 0


def _cmd_refresh() -> int:
    if not settings.database_url:
        print("DATABASE_URL is not set.", file=sys.stderr)
        return 1
    store = PostgresStore(settings.database_url)
    try:
        print(f"{store.refresh_statuses()} opportunities changed status")
    finally:
        store.close()
    return 0


def _write_json(path: Path, store: Store, results: list[RunStats]) -> None:
    rows = getattr(store, "rows", None)
    if rows is None:
        print("--out only applies to --dry-run", file=sys.stderr)
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(rows, indent=2, ensure_ascii=False, default=str), encoding="utf-8"
    )
    print(f"wrote {len(rows)} rows to {path}")


def _print_report(results: list[RunStats], *, dry_run: bool) -> None:
    print()
    print(f"{'source':<20} {'status':<9} {'found':>6} {'new':>6} {'upd':>6} {'same':>6} {'fail':>6}")
    print("-" * 64)
    for r in results:
        print(
            f"{r.source_key:<20} {r.status:<9} {r.items_found:>6} {r.items_created:>6} "
            f"{r.items_updated:>6} {r.items_unchanged:>6} {r.items_failed:>6}"
        )
        if r.error_message:
            print(f"  ! {r.error_type}: {r.error_message}")
        for warning in r.warnings[:5]:
            print(f"  - {warning}")
        if len(r.warnings) > 5:
            print(f"  - ... and {len(r.warnings) - 5} more warnings")
    if dry_run:
        print("\n(dry run - nothing was written to the database)")
