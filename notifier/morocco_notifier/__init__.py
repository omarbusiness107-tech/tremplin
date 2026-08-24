"""Email notifications for the Morocco Opportunities Tracker.

Deliberately a separate package from `scrapers/`: ingestion and
notification share a database and nothing else, so either can be changed,
rescheduled or replaced without touching the other.

    queries.py   who should be told what (SQL only)
    render.py    turning that into an email (no I/O)
    email.py     the Resend transport
    runner.py    claim -> send -> record
    cli.py       entry point
"""

__version__ = "0.1.0"
