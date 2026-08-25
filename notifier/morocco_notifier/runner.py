"""claim -> send -> record, for one notification kind."""

from __future__ import annotations

import logging

import psycopg

from . import queries, render
from .email import EmailError, Mailer
from .models import Digest, RunStats

log = logging.getLogger(__name__)


def run(
    conn: psycopg.Connection,
    mailer: Mailer,
    *,
    kind: str,
    site_url: str,
    max_emails: int,
    lookback_hours: int = 26,
) -> RunStats:
    """Send one kind of notification.

    A failure for one person is logged and the loop continues: everyone
    else's mail should not depend on one bad address.
    """
    stats = RunStats(kind=kind)

    digests = (
        queries.find_new_matches(conn, lookback_hours=lookback_hours)
        if kind == "new_match"
        else queries.find_deadline_reminders(conn)
    )
    stats.users_considered = len(digests)

    for digest in digests:
        if stats.emails_sent >= max_emails:
            log.warning("hit the per-run cap of %s emails; stopping", max_emails)
            break

        if not digest.email:
            stats.skipped_no_email += 1
            continue

        claimed = queries.claim(conn, digest)
        if not claimed:
            # Another run already took these.
            continue

        # Only write about what this run actually claimed.
        digest.opportunities = [o for o in digest.opportunities if o.id in set(claimed)]

        try:
            mailer.send(
                to=digest.email,
                subject=render.subject(digest),
                html=render.html_body(digest, site_url),
                text=render.text_body(digest, site_url),
            )
        except EmailError as exc:
            queries.mark_failed(conn, digest, claimed, str(exc))
            stats.emails_failed += 1
            log.error("could not email %s: %s", digest.email, exc)
            continue

        queries.mark_sent(conn, digest, claimed)
        stats.emails_sent += 1
        stats.opportunities_notified += len(claimed)
        log.info("emailed %s about %s opportunities", digest.email, len(claimed))

    return stats
