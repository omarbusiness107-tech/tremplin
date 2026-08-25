"""9rayti.com -- scholarship announcements (bourses).

Morocco's main student orientation portal. Chosen as the third source
because it adds the one opportunity type the first two do not cover --
scholarships, most of them for study abroad -- and because its listings
are dated announcements rather than structured records, which is the
shape most education sources take.

robots.txt (checked 2026-08-24) is `User-agent: * / Allow: /`.

Shares its template, and every quirk of it, with `concoursa_9rayti.py`
(the post-bac concours section on the same site) via `_nine_rayti.py`.
Read that module first -- in particular the countdown-placeholder trap:
the deadline shown to a human is a hard-coded dummy, and only the
`data-target-date` attribute is real.
"""

from __future__ import annotations

import re

from ..models import OpportunityType
from ..registry import register
from ._nine_rayti import PLACEHOLDER_DEADLINE, LayoutChanged, NineRaytiScraper

__all__ = ["Bourses9raytiScraper", "LayoutChanged", "PLACEHOLDER_DEADLINE"]


@register
class Bourses9raytiScraper(NineRaytiScraper):
    key = "bourses_9rayti"
    name = "9rayti.com — Bourses"

    LISTING_PATH = "/bourses"
    PATH_RE = re.compile(r"^/bourse/(?P<slug>[a-z0-9\-]+)/?$")
    OPPORTUNITY_TYPE = OpportunityType.SCHOLARSHIP
