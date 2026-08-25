"""Scraper discovery.

Dropping a module into `sources/` with a `@register` decorated class is the
only step needed to add a source -- nothing else imports it by name.
"""

from __future__ import annotations

import importlib
import pkgutil
from typing import TypeVar

from .sources.base import BaseScraper

_REGISTRY: dict[str, type[BaseScraper]] = {}

T = TypeVar("T", bound=type[BaseScraper])


def register(scraper_cls: T) -> T:
    if not scraper_cls.key:
        raise ValueError(f"{scraper_cls.__name__} must define a `key`")
    if scraper_cls.key in _REGISTRY:
        raise ValueError(f"duplicate scraper key: {scraper_cls.key}")
    _REGISTRY[scraper_cls.key] = scraper_cls
    return scraper_cls


def load_all() -> dict[str, type[BaseScraper]]:
    """Import every module under `sources/` so decorators run."""
    from . import sources

    for module in pkgutil.iter_modules(sources.__path__):
        if module.name != "base":
            importlib.import_module(f"{sources.__name__}.{module.name}")
    return dict(_REGISTRY)


def get(key: str) -> type[BaseScraper]:
    scrapers = load_all()
    try:
        return scrapers[key]
    except KeyError:
        known = ", ".join(sorted(scrapers)) or "(none)"
        raise KeyError(f"unknown source {key!r}; known sources: {known}") from None
