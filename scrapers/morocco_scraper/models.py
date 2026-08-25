"""The contract between a scraper and the rest of the pipeline.

Every scraper, whatever the site looks like, returns `Opportunity`
instances. Nothing downstream -- dedup, storage, matching, notifications --
knows which site an item came from beyond its `source_key`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from enum import StrEnum
from typing import Any

from .normalize import clean_text, make_content_hash, make_fingerprint


class OpportunityType(StrEnum):
    """Mirrors the `opportunity_type` enum in the database."""

    JOB = "job"
    INTERNSHIP = "internship"
    BACHELOR = "bachelor"
    MASTER = "master"
    DOCTORAT = "doctorat"
    SCHOLARSHIP = "scholarship"
    CONCOURS = "concours"


class EducationLevel(StrEnum):
    """Mirrors the `education_level` enum in the database."""

    BAC = "bac"
    BAC_PLUS_2 = "bac_plus_2"
    LICENCE = "licence"
    MASTER = "master"
    DOCTORAT = "doctorat"
    OTHER = "other"


@dataclass(slots=True)
class Opportunity:
    """One normalized listing, ready to be written to `opportunities`."""

    # Provenance
    source_key: str
    external_id: str          # the listing's own stable id on the source site
    application_link: str

    # Core
    title: str
    type: OpportunityType
    institution: str | None = None
    institution_logo_url: str | None = None
    domains: list[str] = field(default_factory=list)
    location_city: str | None = None
    location_region: str | None = None
    is_remote: bool = False

    # Eligibility
    conditions_to_apply: str | None = None
    required_education_level: EducationLevel | None = None
    min_experience_years: int | None = None
    max_age: int | None = None
    languages_required: list[str] = field(default_factory=list)
    positions_available: int | None = None

    # Dates
    deadline: datetime | None = None
    event_date: date | None = None
    published_at: date | None = None

    # Content
    description: str | None = None
    attributes: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.title = clean_text(self.title) or ""
        self.institution = clean_text(self.institution)
        self.description = clean_text(self.description)
        self.conditions_to_apply = clean_text(self.conditions_to_apply)
        self.location_city = clean_text(self.location_city)

        if not self.title:
            raise ValueError(f"{self.source_key}/{self.external_id}: title is required")
        if not self.application_link:
            raise ValueError(f"{self.source_key}/{self.external_id}: application_link is required")
        if not self.external_id:
            raise ValueError(f"{self.source_key}: external_id is required")

    @property
    def fingerprint(self) -> str:
        """Cross-source duplicate key (title + institution + deadline)."""
        return make_fingerprint(self.title, self.institution, self.deadline)

    @property
    def content_hash(self) -> str:
        """Changes only when something a user would actually notice changed."""
        return make_content_hash(
            {
                "title": self.title,
                "type": self.type,
                "institution": self.institution,
                "domains": ",".join(sorted(self.domains)),
                "location_city": self.location_city,
                "location_region": self.location_region,
                "is_remote": self.is_remote,
                "conditions": self.conditions_to_apply,
                "education": self.required_education_level,
                "experience": self.min_experience_years,
                "max_age": self.max_age,
                "languages": ",".join(sorted(self.languages_required)),
                "positions": self.positions_available,
                "deadline": self.deadline.isoformat() if self.deadline else None,
                "event_date": self.event_date.isoformat() if self.event_date else None,
                "published_at": self.published_at.isoformat() if self.published_at else None,
                "link": self.application_link,
                "description": self.description,
                "attributes": sorted(self.attributes.items()),
            }
        )

    def to_row(self) -> dict[str, Any]:
        """Column-for-column mapping onto `public.opportunities`."""
        return {
            "source_key": self.source_key,
            "external_id": self.external_id,
            "fingerprint": self.fingerprint,
            "content_hash": self.content_hash,
            "title": self.title,
            "type": str(self.type),
            "institution": self.institution,
            "institution_logo_url": self.institution_logo_url,
            "domains": self.domains,
            "location_city": self.location_city,
            "location_region": self.location_region,
            "is_remote": self.is_remote,
            "conditions_to_apply": self.conditions_to_apply,
            "required_education_level": (
                str(self.required_education_level) if self.required_education_level else None
            ),
            "min_experience_years": self.min_experience_years,
            "max_age": self.max_age,
            "languages_required": self.languages_required,
            "positions_available": self.positions_available,
            "deadline": self.deadline,
            "event_date": self.event_date,
            "published_at": self.published_at,
            "application_link": self.application_link,
            "description": self.description,
            "attributes": self.attributes,
        }


@dataclass(slots=True)
class RunStats:
    """Outcome of running one scraper, mirrored into `scraper_runs`."""

    source_key: str
    pages_fetched: int = 0
    items_found: int = 0
    items_created: int = 0
    items_updated: int = 0
    items_unchanged: int = 0
    items_failed: int = 0
    warnings: list[str] = field(default_factory=list)
    error_type: str | None = None
    error_message: str | None = None

    @property
    def status(self) -> str:
        """`failed` if the source blew up, `partial` if some items did."""
        if self.error_type:
            return "failed"
        if self.items_failed or self.warnings:
            return "partial"
        return "success"

    def summary(self) -> str:
        return (
            f"{self.source_key}: {self.items_found} found, "
            f"{self.items_created} new, {self.items_updated} updated, "
            f"{self.items_unchanged} unchanged, {self.items_failed} failed"
        )
