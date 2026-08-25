#!/usr/bin/env python3
"""Check a live Tremplin deployment end to end.

Run this straight after deploying, and again whenever something looks
wrong. It exercises the whole chain rather than any one layer: the public
pages, the database schema, the row-level security rules that are the
only thing standing between a stranger and other people's bookmarks, and
the ingestion freshness.

    python scripts/smoke_test.py --url https://your-app.vercel.app

Add the database and the anon key to get the full set of checks:

    python scripts/smoke_test.py \\
        --url https://your-app.vercel.app \\
        --database-url "$SUPABASE_DB_URL" \\
        --supabase-url https://YOUR-REF.supabase.co \\
        --anon-key "$NEXT_PUBLIC_SUPABASE_ANON_KEY"

Exit code is 0 only if every check passed. Warnings do not fail the run:
they are things worth looking at, not things that are broken.

Requires: requests, psycopg  (both already in scrapers/requirements.txt)
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field
from typing import Callable

try:
    import requests
except ImportError:  # pragma: no cover
    sys.exit("pip install -r scrapers/requirements.txt")

PASS, FAIL, WARN, SKIP = "pass", "fail", "warn", "skip"

#

LOCALES = ("fr", "en", "ar")

TIMEOUT = 30


@dataclass
class Result:
    name: str
    status: str
    detail: str = ""


@dataclass
class Report:
    results: list[Result] = field(default_factory=list)

    def record(self, name: str, status: str, detail: str = "") -> None:
        self.results.append(Result(name, status, detail))
        mark = {PASS: "ok  ", FAIL: "FAIL", WARN: "warn", SKIP: "skip"}[status]
        print(f"  [{mark}] {name}" + (f" — {detail}" if detail else ""))

    def check(self, name: str, fn: Callable[[], tuple[str, str]]) -> None:
        """Run one check; an exception is a failure, never a crash."""
        try:
            status, detail = fn()
        except Exception as exc:
            self.record(name, FAIL, f"{type(exc).__name__}: {exc}")
        else:
            self.record(name, status, detail)

    @property
    def failed(self) -> list[Result]:
        return [r for r in self.results if r.status == FAIL]

    @property
    def warned(self) -> list[Result]:
        return [r for r in self.results if r.status == WARN]


# ---------------------------------------------------------------------
# The public site
# ---------------------------------------------------------------------


def check_site(report: Report, base: str) -> None:
    print("\nPublic site")

    def get(path: str, **kwargs) -> requests.Response:
        return requests.get(base + path, timeout=TIMEOUT, **kwargs)

    def locale_redirect() -> tuple[str, str]:
        """A bare URL must land on a locale, defaulting to French."""
        response = requests.get(base + "/", timeout=TIMEOUT, allow_redirects=False)
        if response.status_code not in (301, 302, 307, 308):
            return FAIL, f"/ did not redirect (HTTP {response.status_code})"
        target = response.headers.get("location", "")
        if not any(target.rstrip("/").endswith(f"/{l}") for l in LOCALES):
            return FAIL, f"/ redirected to {target!r}, which carries no locale"
        return PASS, f"/ -> {target}"

    def browse(locale: str) -> tuple[str, str]:
        response = get(f"/{locale}")
        if response.status_code != 200:
            return FAIL, f"HTTP {response.status_code}"
        body = response.text
        # Assert on markers that do not move when the copy is retranslated:
        # the brand name, and the lang/dir the layout must emit.
        if "Tremplin" not in body:
            return FAIL, "page rendered without the brand name"
        if f'lang="{locale}"' not in body:
            return FAIL, f'missing lang="{locale}" on <html>'
        expected_dir = "rtl" if locale == "ar" else "ltr"
        if f'dir="{expected_dir}"' not in body:
            return FAIL, f'missing dir="{expected_dir}" on <html>'
        # The empty states carry a stable marker so this does not have to
        # know the copy in three languages.
        if 'data-empty-state="not-configured"' in body:
            return FAIL, "the app cannot reach Supabase — check the env vars on the host"
        if 'data-empty-state="load-error"' in body:
            return FAIL, "the app reached Supabase but the query failed"
        if 'data-empty-state="empty-database"' in body:
            return WARN, "reachable but empty — run the ingestion workflow"
        return PASS, f"renders, lang={locale} dir={expected_dir}"

    def filters() -> tuple[str, str]:
        response = get("/fr/?type=concours&sort=newest")
        if response.status_code != 200:
            return FAIL, f"HTTP {response.status_code}"
        return PASS, "filtered view renders"

    def search() -> tuple[str, str]:
        response = get("/fr/?q=ing%C3%A9nieur")
        if response.status_code != 200:
            return FAIL, f"HTTP {response.status_code}"
        return PASS, "search renders"

    def arabic_search() -> tuple[str, str]:
        """Arabic queries route to the second search vector."""
        response = get("/ar/?q=%D8%AA%D8%B1%D8%B4%D9%8A%D8%AD")
        if response.status_code != 200:
            return FAIL, f"HTTP {response.status_code}"
        return PASS, "Arabic search renders"

    def login() -> tuple[str, str]:
        response = get("/fr/login")
        if response.status_code != 200:
            return FAIL, f"HTTP {response.status_code}"
        # The form, not its label — the label is translated three ways.
        if 'type="email"' not in response.text:
            return FAIL, "login page did not render its email field"
        return PASS, "sign-in page renders its form"

    def admin_is_hidden() -> tuple[str, str]:
        """Follow redirects: a bare /admin now redirects into a locale,
        and it is the page at the end that must refuse."""
        response = get("/fr/admin", allow_redirects=True)
        if response.status_code == 200:
            return FAIL, "/fr/admin served 200 to an anonymous visitor"
        return PASS, f"/fr/admin refuses anonymous visitors (HTTP {response.status_code})"

    report.check("locale redirect", locale_redirect)
    for locale in LOCALES:
        report.check(f"browse page ({locale})", lambda l=locale: browse(l))
    report.check("filtering", filters)
    report.check("search", search)
    report.check("arabic search", arabic_search)
    report.check("sign-in page", login)
    report.check("admin is not public", admin_is_hidden)


# ---------------------------------------------------------------------
# Row level security, through the public API with the anon key
#
# These are the checks worth running most: RLS is the only thing between a
# stranger and other people's saved opportunities, and a misapplied
# migration fails open.
# ---------------------------------------------------------------------


def check_rls(report: Report, supabase_url: str, anon_key: str) -> None:
    print("\nRow level security (anon key)")
    rest = supabase_url.rstrip("/") + "/rest/v1"
    headers = {"apikey": anon_key, "Authorization": f"Bearer {anon_key}"}

    def readable(table: str) -> tuple[str, str]:
        response = requests.get(
            f"{rest}/{table}?select=*&limit=1", headers=headers, timeout=TIMEOUT
        )
        if response.status_code != 200:
            return FAIL, f"HTTP {response.status_code}: {response.text[:120]}"
        return PASS, "readable without an account, as intended"

    def not_readable(table: str) -> tuple[str, str]:
        response = requests.get(
            f"{rest}/{table}?select=*&limit=1", headers=headers, timeout=TIMEOUT
        )
        if response.status_code in (401, 403):
            return PASS, f"refused (HTTP {response.status_code})"
        if response.status_code == 200 and response.json() == []:
            return PASS, "returns nothing to an anonymous caller"
        return FAIL, f"exposed to anonymous callers: HTTP {response.status_code} {response.text[:120]}"

    def not_writable() -> tuple[str, str]:
        response = requests.post(
            f"{rest}/opportunities",
            headers={**headers, "Content-Type": "application/json"},
            json={"title": "smoke-test", "type": "job", "application_link": "https://x",
                  "source_key": "x", "external_id": "x", "fingerprint": "x", "content_hash": "x"},
            timeout=TIMEOUT,
        )
        if response.status_code in (401, 403, 404, 405):
            return PASS, f"insert refused (HTTP {response.status_code})"
        if response.status_code < 300:
            return FAIL, "an anonymous caller was able to insert an opportunity"
        return PASS, f"insert refused (HTTP {response.status_code})"

    report.check("opportunities are public", lambda: readable("opportunities"))
    report.check("domains are public", lambda: readable("domains"))
    report.check("bookmarks are private", lambda: not_readable("bookmarks"))
    report.check("profiles are private", lambda: not_readable("profiles"))
    report.check("scraper runs are private", lambda: not_readable("scraper_runs"))
    report.check("notifications are private", lambda: not_readable("notifications"))
    report.check("the catalogue is read-only", not_writable)


# ---------------------------------------------------------------------
# The database itself
# ---------------------------------------------------------------------

EXPECTED_TABLES = [
    "sources", "domains", "opportunities", "profiles",
    "user_preferences", "bookmarks", "scraper_runs", "notifications",
]
EXPECTED_FUNCTIONS = [
    "compute_opportunity_status", "refresh_opportunity_statuses",
    "opportunity_search_vector", "recommended_opportunities", "education_rank",
]


def check_database(report: Report, dsn: str) -> None:
    print("\nDatabase")
    try:
        import psycopg
    except ImportError:
        report.record("database", SKIP, "psycopg not installed")
        return

    with psycopg.connect(dsn, connect_timeout=TIMEOUT) as conn:

        def one(sql: str, params: tuple = ()):
            with conn.cursor() as cur:
                cur.execute(sql, params)
                row = cur.fetchone()
                return row[0] if row else None

        def tables() -> tuple[str, str]:
            found = one(
                "select array_agg(tablename) from pg_tables where schemaname = 'public'"
            ) or []
            missing = [t for t in EXPECTED_TABLES if t not in found]
            if missing:
                return FAIL, f"missing: {', '.join(missing)} — migrations not fully applied"
            return PASS, f"all {len(EXPECTED_TABLES)} tables present"

        def functions() -> tuple[str, str]:
            found = one(
                "select array_agg(distinct proname) from pg_proc p "
                "join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'"
            ) or []
            missing = [f for f in EXPECTED_FUNCTIONS if f not in found]
            if missing:
                return FAIL, f"missing: {', '.join(missing)}"
            return PASS, "schema functions present"

        def rls() -> tuple[str, str]:
            unprotected = one(
                "select array_agg(tablename) from pg_tables "
                "where schemaname = 'public' and not rowsecurity"
            )
            if unprotected:
                return FAIL, f"RLS disabled on: {', '.join(unprotected)}"
            return PASS, "enabled on every table"

        def listings() -> tuple[str, str]:
            total = one("select count(*) from opportunities")
            if not total:
                return WARN, "no listings yet — run the ingestion workflow"
            open_now = one("select count(*) from opportunities where status <> 'closed'")
            return PASS, f"{total} listings, {open_now} open"

        def search_vectors() -> tuple[str, str]:
            empty = one(
                "select count(*) from opportunities "
                "where search_vector is null or search_vector_ar is null"
            )
            if empty:
                return FAIL, f"{empty} rows have no search vector"
            return PASS, "french and arabic vectors populated"

        def sources_registered() -> tuple[str, str]:
            rows = one("select array_agg(key) from sources") or []
            if not rows:
                return FAIL, "no sources registered"
            return PASS, ", ".join(rows)

        def ingestion_fresh() -> tuple[str, str]:
            stale = one(
                "select array_agg(source_key) from source_health "
                "where enabled and (last_run_at is null "
                "                   or last_run_at < now() - interval '48 hours')"
            )
            if stale:
                return WARN, f"no successful run in 48h: {', '.join(stale)}"
            return PASS, "every enabled source ran in the last 48 hours"

        def failing_sources() -> tuple[str, str]:
            broken = one(
                "select array_agg(source_key) from source_health where last_run_status = 'failed'"
            )
            if broken:
                return FAIL, f"last run failed: {', '.join(broken)} — check /admin"
            degraded = one(
                "select array_agg(source_key) from source_health where last_run_status = 'partial'"
            )
            if degraded:
                return WARN, f"last run partial: {', '.join(degraded)}"
            return PASS, "no source is failing"

        def statuses_current() -> tuple[str, str]:
            """A listing past its deadline must not still read as open."""
            wrong = one(
                "select count(*) from opportunities "
                "where status <> compute_opportunity_status(deadline, is_active)"
            )
            if wrong:
                return WARN, f"{wrong} listings have a stale status — run refresh-status"
            return PASS, "deadline statuses are current"

        report.check("tables", tables)
        report.check("functions", functions)
        report.check("row level security", rls)
        report.check("sources registered", sources_registered)
        report.check("listings present", listings)
        report.check("search vectors", search_vectors)
        report.check("ingestion freshness", ingestion_fresh)
        report.check("source health", failing_sources)
        report.check("deadline statuses", statuses_current)


# ---------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Check a live Tremplin deployment."
    )
    parser.add_argument("--url", required=True, help="deployed site, e.g. https://x.vercel.app")
    parser.add_argument("--database-url", help="Supabase Postgres connection string")
    parser.add_argument("--supabase-url", help="https://YOUR-REF.supabase.co")
    parser.add_argument("--anon-key", help="NEXT_PUBLIC_SUPABASE_ANON_KEY")
    args = parser.parse_args(argv)

    base = args.url.rstrip("/")
    report = Report()

    print(f"Checking {base}")
    check_site(report, base)

    if args.supabase_url and args.anon_key:
        check_rls(report, args.supabase_url, args.anon_key)
    else:
        print("\nRow level security (anon key)")
        report.record("rls checks", SKIP, "pass --supabase-url and --anon-key to include these")

    if args.database_url:
        check_database(report, args.database_url)
    else:
        print("\nDatabase")
        report.record("database checks", SKIP, "pass --database-url to include these")

    passed = sum(1 for r in report.results if r.status == PASS)
    print(
        f"\n{passed} passed, {len(report.failed)} failed, "
        f"{len(report.warned)} warnings, "
        f"{sum(1 for r in report.results if r.status == SKIP)} skipped"
    )

    if report.failed:
        print("\nFailures:")
        for result in report.failed:
            print(f"  - {result.name}: {result.detail}")
        return 1

    if report.warned:
        print("\nWorth a look:")
        for result in report.warned:
            print(f"  - {result.name}: {result.detail}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
