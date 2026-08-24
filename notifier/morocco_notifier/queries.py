"""Who should be told what.

All the selection logic is SQL, and all of it excludes anything already
recorded in `notifications`. That table's unique constraint
(user_id, opportunity_id, kind) is the real guarantee against duplicate
emails; these queries just avoid doing pointless work.
"""

from __future__ import annotations

import psycopg
from psycopg.rows import dict_row

from .models import Digest, OpportunityBrief

# A listing matches a profile when it clears the same bar the
# "Recommended for you" ranking uses: the right type, or one of the
# user's fields. Deliberately stricter than the on-site ranking -- an
# email is interruptive in a way a list on a page is not.
_NEW_MATCHES_SQL = """
select
    p.id                      as user_id,
    p.email                   as email,
    p.full_name               as full_name,
    o.id                      as opportunity_id,
    o.title, o.type, o.institution, o.deadline, o.location_city, o.domains
from public.profiles p
join public.user_preferences up on up.user_id = p.id
join public.opportunities o
  on o.status in ('open', 'closing_soon')
 and o.discovered_at >= now() - make_interval(hours => %(lookback_hours)s)
 and (
       o.type = any(up.target_types)
       or o.domains && up.fields_of_interest
     )
where up.email_alerts_enabled
  and p.email is not null
  -- Never mail someone about something they cannot apply for.
  and (
    o.required_education_level is null
    or public.education_rank(up.education_level) = 0
    or public.education_rank(up.education_level)
       >= public.education_rank(o.required_education_level)
  )
  -- A sent notification blocks forever; a failed one blocks only for a
  -- cooldown, so a transient email outage retries tomorrow.
  and not exists (
    select 1 from public.notifications n
     where n.user_id = p.id and n.opportunity_id = o.id and n.kind = 'new_match'
       and (n.sent_at is not null or n.created_at > now() - interval '20 hours')
  )
order by p.id, o.deadline asc nulls last
"""

# A bookmark whose deadline falls inside the user's chosen reminder
# window. `deadline_reminder_days = 0` means they opted out of reminders.
_DEADLINE_REMINDERS_SQL = """
select
    p.id                      as user_id,
    p.email                   as email,
    p.full_name               as full_name,
    o.id                      as opportunity_id,
    o.title, o.type, o.institution, o.deadline, o.location_city, o.domains
from public.bookmarks b
join public.profiles p on p.id = b.user_id
join public.user_preferences up on up.user_id = b.user_id
join public.opportunities o on o.id = b.opportunity_id
where up.deadline_reminder_days > 0
  and p.email is not null
  and o.deadline is not null
  and o.deadline > now()
  and o.deadline <= now() + make_interval(days => up.deadline_reminder_days)
  and not exists (
    select 1 from public.notifications n
     where n.user_id = p.id and n.opportunity_id = o.id and n.kind = 'deadline_reminder'
       and (n.sent_at is not null or n.created_at > now() - interval '20 hours')
  )
order by p.id, o.deadline asc
"""


def find_new_matches(conn: psycopg.Connection, *, lookback_hours: int = 26) -> list[Digest]:
    """Newly discovered listings matching a profile.

    The default window is slightly longer than the daily ingestion
    interval, so a run that starts late does not skip a day.
    """
    return _digests(conn, _NEW_MATCHES_SQL, {"lookback_hours": lookback_hours}, "new_match")


def find_deadline_reminders(conn: psycopg.Connection) -> list[Digest]:
    return _digests(conn, _DEADLINE_REMINDERS_SQL, {}, "deadline_reminder")


def _digests(
    conn: psycopg.Connection, sql: str, params: dict, kind: str
) -> list[Digest]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()

    digests: dict[str, Digest] = {}
    for row in rows:
        digest = digests.get(row["user_id"])
        if digest is None:
            digest = Digest(
                user_id=row["user_id"],
                email=row["email"],
                full_name=row["full_name"],
                kind=kind,
            )
            digests[row["user_id"]] = digest

        digest.opportunities.append(
            OpportunityBrief(
                id=row["opportunity_id"],
                title=row["title"],
                type=row["type"],
                institution=row["institution"],
                deadline=row["deadline"],
                location_city=row["location_city"],
                domains=list(row["domains"] or []),
            )
        )

    return list(digests.values())


def claim(conn: psycopg.Connection, digest: Digest) -> list[str]:
    """Reserve this digest's opportunities before sending.

    Rows are written *before* the email goes out, and the unique
    constraint decides who wins. A crash after this point costs one
    missed email; doing it the other way round would cost duplicates,
    which is the worse failure.

    Returns the opportunity ids actually claimed -- another run that got
    there first takes them, and this one skips them.
    """
    claimed: list[str] = []
    with conn.cursor() as cur:
        for opportunity in digest.opportunities:
            # `do update ... where sent_at is null` re-claims a previous
            # failed attempt; an already-sent row matches the constraint
            # but not the WHERE, so it returns nothing and is skipped.
            cur.execute(
                """
                insert into public.notifications (user_id, opportunity_id, kind)
                values (%s, %s, %s::notification_kind)
                on conflict on constraint notifications_once_per_reason do update
                    set created_at = now(), error = null
                  where public.notifications.sent_at is null
                returning opportunity_id
                """,
                (digest.user_id, opportunity.id, digest.kind),
            )
            if cur.fetchone():
                claimed.append(opportunity.id)
    return claimed


def mark_sent(conn: psycopg.Connection, digest: Digest, ids: list[str]) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "update public.notifications set sent_at = now(), error = null "
            "where user_id = %s and kind = %s::notification_kind and opportunity_id = any(%s)",
            (digest.user_id, digest.kind, ids),
        )


def mark_failed(conn: psycopg.Connection, digest: Digest, ids: list[str], error: str) -> None:
    """Record why the send failed, leaving `sent_at` null.

    The row stays so the reason is visible, and the cooldown in the
    selection queries lets the next day's run try again.
    """
    with conn.cursor() as cur:
        cur.execute(
            "update public.notifications set error = %s "
            "where user_id = %s and kind = %s::notification_kind "
            "and opportunity_id = any(%s) and sent_at is null",
            (error[:2000], digest.user_id, digest.kind, ids),
        )
