"""Turning a digest into an email. Pure functions, no I/O.

Plain and scannable on purpose: the useful content is the deadline and
the link, so the design gets out of their way. A text/plain alternative
goes with every message, because an alert that renders as a blank box in
a strict client is worse than no alert.
"""

from __future__ import annotations

import html

from .models import Digest, OpportunityBrief

TYPE_LABELS = {
    "job": "Job",
    "internship": "Internship",
    "bachelor": "Bachelor",
    "master": "Master",
    "doctorat": "Doctorate",
    "scholarship": "Scholarship",
    "concours": "Concours",
}


def subject(digest: Digest) -> str:
    count = len(digest.opportunities)

    if digest.kind == "deadline_reminder":
        if count == 1:
            days = digest.opportunities[0].days_left
            when = "closes today" if days == 0 else f"closes in {days} day{'s' if days != 1 else ''}"
            return f"Reminder: {_truncate(digest.opportunities[0].title, 60)} {when}"
        return f"{count} saved opportunities are closing soon"

    if count == 1:
        return f"New: {_truncate(digest.opportunities[0].title, 70)}"
    return f"{count} new opportunities match your profile"


def text_body(digest: Digest, site_url: str) -> str:
    greeting = f"Hi {digest.first_name}," if digest.first_name else "Hi,"
    lines = [greeting, "", _intro(digest), ""]

    for opportunity in digest.opportunities:
        lines.append(f"* {opportunity.title}")
        if opportunity.institution:
            lines.append(f"  {opportunity.institution}")
        lines.append(f"  {_deadline_line(opportunity)}")
        lines.append(f"  {site_url}/opportunities/{opportunity.id}")
        lines.append("")

    lines += [
        f"Browse everything: {site_url}",
        f"Change what you get emailed: {site_url}/profile",
    ]
    return "\n".join(lines)


def html_body(digest: Digest, site_url: str) -> str:
    greeting = f"Hi {html.escape(digest.first_name)}," if digest.first_name else "Hi,"

    cards = "".join(_card(o, site_url) for o in digest.opportunities)

    return f"""\
<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c2024;">
  <div style="max-width:560px;margin:0 auto;">
    <p style="font-size:15px;line-height:1.5;margin:0 0 4px;">{greeting}</p>
    <p style="font-size:15px;line-height:1.5;margin:0 0 20px;color:#5b6470;">
      {html.escape(_intro(digest))}
    </p>
    {cards}
    <p style="font-size:13px;line-height:1.6;color:#8a929c;margin:24px 0 0;">
      <a href="{site_url}" style="color:#0f766e;">Browse all opportunities</a>
      &nbsp;·&nbsp;
      <a href="{site_url}/profile" style="color:#0f766e;">Change what you get emailed</a>
    </p>
  </div>
</body>
</html>"""


def _card(opportunity: OpportunityBrief, site_url: str) -> str:
    institution = (
        f'<p style="font-size:13px;color:#5b6470;margin:0 0 10px;">'
        f"{html.escape(opportunity.institution)}</p>"
        if opportunity.institution
        else ""
    )
    urgent = opportunity.days_left is not None and opportunity.days_left <= 7
    deadline_color = "#b4291f" if urgent else "#5b6470"

    return f"""\
    <div style="background:#ffffff;border:1px solid #e6e8eb;border-radius:12px;padding:16px;margin-bottom:12px;">
      <p style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#8a929c;margin:0 0 6px;">
        {html.escape(TYPE_LABELS.get(opportunity.type, opportunity.type))}
      </p>
      <p style="font-size:15px;font-weight:600;line-height:1.35;margin:0 0 6px;">
        <a href="{site_url}/opportunities/{opportunity.id}" style="color:#1c2024;text-decoration:none;">
          {html.escape(opportunity.title)}
        </a>
      </p>
      {institution}
      <p style="font-size:13px;color:{deadline_color};margin:0;">
        {html.escape(_deadline_line(opportunity))}
      </p>
    </div>"""


def _intro(digest: Digest) -> str:
    count = len(digest.opportunities)
    plural = "opportunity" if count == 1 else "opportunities"

    if digest.kind == "deadline_reminder":
        return f"{count} {plural} you saved {'is' if count == 1 else 'are'} closing soon."
    return f"{count} new {plural} matched your profile since yesterday."


def _deadline_line(opportunity: OpportunityBrief) -> str:
    days = opportunity.days_left
    if days is None:
        return "Rolling — no stated deadline"
    if days == 0:
        return "Closes today"
    if days == 1:
        return "Closes tomorrow"
    return f"Closes in {days} days"


def _truncate(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"
