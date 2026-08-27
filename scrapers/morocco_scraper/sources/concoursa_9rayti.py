"""9rayti.com -- post-bac concours announcements.

The `/concoursa/` section covers Morocco's competitive entrance exams for
public higher education: ENSA, EST, FST, ENCG, medicine faculties and the
open-access university registration windows. Far more students sit these
than the public-sector concours `emploi_public` covers, and it is one of
the site's few sections published mostly in Arabic -- which makes it the
first source to actually exercise `search_vector_ar` rather than just
being covered by tests for it.

Most of these titles carry only an institution acronym (FST, EST, ENCG,
ENA, ISMAC...) and no separate field description, which is why
`normalize.ACRONYM_DOMAINS` exists -- see there for how those are matched
without colliding with ordinary French ("EST" the school vs. "c'est").

robots.txt (checked 2026-08-24) is `User-agent: * / Allow: /`.

Shares its template with `bourses_9rayti.py` via `_nine_rayti.py` --
same listing grid, same countdown-placeholder deadline trap, same article
structure. Read that module first.
"""

from __future__ import annotations

import re

from ..models import OpportunityType
from ..registry import register
from ._nine_rayti import (
    LayoutChanged,
    NineRaytiScraper,
    entry_level_for_type,
    programme_type_from_title,
)

__all__ = ["ConcoursA9raytiScraper", "LayoutChanged"]


@register
class ConcoursA9raytiScraper(NineRaytiScraper):
    key = "concoursa_9rayti"
    name = "9rayti.com — Concours post-bac"

    LISTING_PATH = "/concoursa"
    PATH_RE = re.compile(r"^/concoursa/(?P<slug>[a-z0-9\-]+)/?$")
    OPPORTUNITY_TYPE = OpportunityType.CONCOURS

    def _parse_card(self, card):
        """Expose degree-specific admissions in their own app filters."""
        opportunity = super()._parse_card(card)
        if opportunity is None:
            return None
        opportunity.type = programme_type_from_title(opportunity.title, self.OPPORTUNITY_TYPE)
        opportunity.required_education_level = entry_level_for_type(opportunity.type)
        return opportunity
