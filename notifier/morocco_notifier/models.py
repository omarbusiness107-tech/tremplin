"""What the notifier passes around."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass(slots=True)
class OpportunityBrief:
    """Just enough of an opportunity to write an email about it."""

    id: str
    title: str
    type: str
    institution: str | None
    deadline: datetime | None
    location_city: str | None
    domains: list[str]

    @property
    def days_left(self) -> int | None:
        if self.deadline is None:
            return None
        delta = self.deadline - datetime.now(self.deadline.tzinfo)
        return max(0, -(-delta.days))  # ceil


@dataclass(slots=True)
class Digest:
    """Everything one person is about to be emailed, in one message.

    One email per person per run, never one per opportunity: five separate
    alerts in an inbox is how an alerts feature gets muted.
    """

    user_id: str
    email: str
    full_name: str | None
    kind: str
    opportunities: list[OpportunityBrief] = field(default_factory=list)

    @property
    def first_name(self) -> str | None:
        return self.full_name.split(" ")[0] if self.full_name else None


@dataclass(slots=True)
class RunStats:
    kind: str
    users_considered: int = 0
    emails_sent: int = 0
    emails_failed: int = 0
    opportunities_notified: int = 0
    skipped_no_email: int = 0

    def summary(self) -> str:
        return (
            f"{self.kind}: {self.users_considered} users, "
            f"{self.emails_sent} sent, {self.emails_failed} failed, "
            f"{self.opportunities_notified} opportunities"
        )
