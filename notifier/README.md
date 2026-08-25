# Notifications

See the [root README](../README.md) for setup, the CLI and the scheduling. This
file covers how the package is laid out and why.

```
queries.py   who should be told what — SQL only
render.py    turning that into an email — pure, no I/O
email.py     the Resend transport, behind a Mailer protocol
runner.py    claim -> send -> record
cli.py       entry point
```

Nothing here imports from `scrapers/`. The two share a database and nothing
else, so either can be rescheduled, rewritten or replaced independently.

## Why claim before send

The order matters more than it looks:

```python
claimed = queries.claim(conn, digest)   # insert the notification rows
mailer.send(...)                        # then send
queries.mark_sent(conn, digest, claimed)
```

Crashing between the claim and the send costs one missed email. Crashing
between a send and a "record that we sent it" would cost a duplicate — and an
alerts feature that double-mails is one people turn off. The unique constraint
on `(user_id, opportunity_id, kind)` decides who wins when two runs overlap;
whoever loses the insert simply skips those rows.

A failed send keeps its row with the error recorded and `sent_at` null. The
selection queries ignore such a row for 20 hours, so a transient outage retries
on the next run rather than being swallowed.

## Adding a notification kind

1. Add the value to the `notification_kind` enum in a migration.
2. Add a selection query in `queries.py` — it must exclude anything already in
   `notifications` for that kind, including the cooldown clause.
3. Add the copy to `render.py` (`subject`, `_intro`) and a test in
   `tests/test_render.py`.
4. Add the kind to `KINDS` in `cli.py`.

`runner.py` should not need to change.

## Tests

```bash
pytest tests/test_render.py     # pure, offline

createdb tracker_test
DATABASE_URL=postgresql://localhost/tracker_test ../supabase/local-dev/apply.sh
TEST_DATABASE_URL=postgresql://localhost/tracker_test pytest
```

Use a dedicated database — the selection tests assert exact counts, so any
other data in the table will fail them.
