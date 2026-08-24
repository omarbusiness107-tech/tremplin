"""Ingestion pipeline for the Morocco Opportunities Tracker.

Layout:
    models.py     the normalized opportunity every scraper must return
    normalize.py  text / date / domain helpers shared by all scrapers
    http_client.py polite HTTP session (robots.txt, rate limit, retries)
    registry.py   scraper discovery
    sources/      one module per site
    store.py      persistence (Postgres, or dry-run)
    pipeline.py   run scrapers -> dedupe -> upsert -> record the run
"""

__version__ = "0.1.0"
