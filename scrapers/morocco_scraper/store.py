"""Persistence.

Two implementations behind one interface:

  PostgresStore  writes to Supabase (or any Postgres) with the dedup rules
  DryRunStore    keeps everything in memory, for `--dry-run`

Deduplication happens here rather than in the scrapers, so every source
gets it identically:

  1. match on (source_key, external_id) -- the same listing re-scraped;
  2. otherwise match on fingerprint *from a different source* -- the same
     opportunity published on a second site;
  3. otherwise insert.

Step 2 is restricted to other sources on purpose. Within one source the
site's own id is the authority: emploi-public.ma really does publish two
distinct concours with the same grade, administration and closing date,
differing only in speciality, and treating those as one would silently
drop a real opportunity.

A matched row whose content_hash is unchanged only gets `last_seen_at`
bumped, which keeps `updated_at` meaningful for the "recently updated" UI.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Literal, Protocol

import psycopg
from psycopg.rows import tuple_row
from psycopg.types.json import Jsonb

from .models import Opportunity, RunStats

log = logging.getLogger(__name__)

UpsertResult = Literal["created", "updated", "unchanged"]

_COLUMNS = (
    "source_key", "external_id", "fingerprint", "content_hash", "title", "type",
    "institution", "institution_logo_url", "domains", "location_city", "location_region",
    "is_remote", "conditions_to_apply", "required_education_level", "min_experience_years",
    "max_age", "languages_required", "positions_available", "deadline", "event_date",
    "published_at", "application_link", "description", "attributes",
)

# Enum-typed columns need an explicit cast because we bind them as text.
_CASTS = {"type": "opportunity_type", "required_education_level": "education_level"}


def _placeholder(column: str) -> str:
    cast = _CASTS.get(column)
    return f"%({column})s::{cast}" if cast else f"%({column})s"


_INSERT_SQL = (
    f"insert into opportunities ({', '.join(_COLUMNS)}) "
    f"values ({', '.join(_placeholder(c) for c in _COLUMNS)}) returning id"
)

# discovered_at is deliberately never updated: it is the "date discovered".
_UPDATE_SQL = (
    "update opportunities set "
    + ", ".join(
        f"{c} = {_placeholder(c)}"
        for c in _COLUMNS
        if c not in ("source_key", "external_id")
    )
    + ", last_seen_at = now(), is_active = true where id = %(id)s"
)


class Store(Protocol):
    def ensure_source(self, *, key: str, name: str, homepage_url: str, notes: str) -> None: ...
    def upsert(self, opportunity: Opportunity) -> UpsertResult: ...
    def start_run(self, run_group: uuid.UUID, source_key: str) -> uuid.UUID | None: ...
    def finish_run(self, run_id: uuid.UUID | None, stats: RunStats) -> None: ...
    def refresh_statuses(self) -> int: ...
    def close(self) -> None: ...


class PostgresStore:
    """Writes through a direct Postgres connection.

    Point DATABASE_URL at the Supabase connection string for the service
    role: ingestion is the only writer of `opportunities`, and RLS grants
    no write policy to anon or authenticated.
    """

    def __init__(self, dsn: str) -> None:
        self.conn = psycopg.connect(dsn, autocommit=True, row_factory=tuple_row)

    # -- sources ---------------------------------------------------------

    def ensure_source(self, *, key: str, name: str, homepage_url: str, notes: str = "") -> None:
        """Register the scraper's source row if the seed migration predates it."""
        with self.conn.cursor() as cur:
            cur.execute(
                """
                insert into sources (key, name, homepage_url, notes)
                values (%s, %s, %s, nullif(%s, ''))
                on conflict (key) do update
                  set name = excluded.name,
                      homepage_url = excluded.homepage_url,
                      notes = coalesce(excluded.notes, sources.notes)
                """,
                (key, name, homepage_url, notes),
            )

    # -- opportunities ---------------------------------------------------

    def upsert(self, opportunity: Opportunity) -> UpsertResult:
        row = _bind(opportunity)

        with self.conn.cursor() as cur:
            cur.execute(
                "select id, content_hash from opportunities "
                "where source_key = %(source_key)s and external_id = %(external_id)s",
                row,
            )
            existing = cur.fetchone()

            if existing is not None:
                row_id, existing_hash = existing
                if existing_hash == row["content_hash"]:
                    cur.execute(
                        "update opportunities set last_seen_at = now() where id = %s", (row_id,)
                    )
                    return "unchanged"
                cur.execute(_UPDATE_SQL, {**row, "id": row_id})
                return "updated"

            # Already published by another source? Keep the incumbent row and
            # just mark it as still live. Rewriting it with this source's
            # wording would make the two sources fight over the row on every
            # run, churning updated_at for no reader benefit.
            cur.execute(
                "select id from opportunities "
                "where fingerprint = %(fingerprint)s and source_key <> %(source_key)s limit 1",
                row,
            )
            if (duplicate := cur.fetchone()) is not None:
                log.info(
                    "%s/%s duplicates an existing listing from another source; suppressed",
                    row["source_key"], row["external_id"],
                )
                cur.execute(
                    "update opportunities set last_seen_at = now() where id = %s", (duplicate[0],)
                )
                return "unchanged"

            try:
                # A savepoint keeps a constraint violation from poisoning the
                # connection and costing us the rest of the batch.
                with self.conn.transaction():
                    cur.execute(_INSERT_SQL, row)
                return "created"
            except psycopg.errors.UniqueViolation:
                # Another writer inserted the same (source_key, external_id)
                # between the lookup and the insert.
                cur.execute(
                    "select id from opportunities "
                    "where source_key = %(source_key)s and external_id = %(external_id)s",
                    row,
                )
                clash = cur.fetchone()
                if clash is None:
                    raise
                cur.execute(_UPDATE_SQL, {**row, "id": clash[0]})
                return "updated"

    # -- run bookkeeping -------------------------------------------------

    def start_run(self, run_group: uuid.UUID, source_key: str) -> uuid.UUID:
        with self.conn.cursor() as cur:
            cur.execute(
                "insert into scraper_runs (run_group, source_key, status) "
                "values (%s, %s, 'running') returning id",
                (str(run_group), source_key),
            )
            return cur.fetchone()[0]

    def finish_run(self, run_id: uuid.UUID | None, stats: RunStats) -> None:
        if run_id is None:
            return
        with self.conn.cursor() as cur:
            cur.execute(
                """
                update scraper_runs set
                    status          = %(status)s::scraper_run_status,
                    finished_at     = now(),
                    duration_ms     = (extract(epoch from (now() - started_at)) * 1000)::int,
                    pages_fetched   = %(pages_fetched)s,
                    items_found     = %(items_found)s,
                    items_created   = %(items_created)s,
                    items_updated   = %(items_updated)s,
                    items_unchanged = %(items_unchanged)s,
                    items_failed    = %(items_failed)s,
                    error_type      = %(error_type)s,
                    error_message   = %(error_message)s,
                    warnings        = %(warnings)s
                where id = %(id)s
                """,
                {
                    "id": run_id,
                    "status": stats.status,
                    "pages_fetched": stats.pages_fetched,
                    "items_found": stats.items_found,
                    "items_created": stats.items_created,
                    "items_updated": stats.items_updated,
                    "items_unchanged": stats.items_unchanged,
                    "items_failed": stats.items_failed,
                    "error_type": stats.error_type,
                    "error_message": stats.error_message,
                    "warnings": Jsonb(stats.warnings),
                },
            )

    def refresh_statuses(self) -> int:
        with self.conn.cursor() as cur:
            cur.execute("select refresh_opportunity_statuses()")
            return cur.fetchone()[0]

    def close(self) -> None:
        self.conn.close()


class DryRunStore:
    """Runs the whole pipeline without a database.

    Applies the same in-batch fingerprint dedup as PostgresStore so a dry
    run reports the counts a real run would produce.
    """

    def __init__(self) -> None:
        self.rows: list[dict[str, Any]] = []
        self._seen_keys: set[tuple[str, str]] = set()
        self._seen_fingerprints: set[tuple[str, str]] = set()

    def ensure_source(self, **_: Any) -> None:
        return None

    def upsert(self, opportunity: Opportunity) -> UpsertResult:
        row = _bind(opportunity, jsonb=False)
        key = (row["source_key"], row["external_id"])
        fingerprint = (row["fingerprint"], row["source_key"])
        # Same rule as PostgresStore: the site's own id wins within a source,
        # the fingerprint only suppresses a duplicate from another source.
        if key in self._seen_keys:
            return "unchanged"
        if any(
            fp == row["fingerprint"] and src != row["source_key"]
            for fp, src in self._seen_fingerprints
        ):
            return "unchanged"
        self._seen_keys.add(key)
        self._seen_fingerprints.add(fingerprint)
        self.rows.append(row)
        return "created"

    def start_run(self, run_group: uuid.UUID, source_key: str) -> None:
        return None

    def finish_run(self, run_id: uuid.UUID | None, stats: RunStats) -> None:
        return None

    def refresh_statuses(self) -> int:
        return 0

    def close(self) -> None:
        return None


def _bind(opportunity: Opportunity, *, jsonb: bool = True) -> dict[str, Any]:
    row = opportunity.to_row()
    if jsonb:
        row["attributes"] = Jsonb(row["attributes"])
    return row
