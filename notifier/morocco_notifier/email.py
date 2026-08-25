"""Resend transport.

Kept behind a tiny interface so the runner never imports `requests`, and
so `--dry-run` is a real code path rather than a flag checked in three
places.
"""

from __future__ import annotations

import logging
from typing import Protocol

import requests

log = logging.getLogger(__name__)

RESEND_ENDPOINT = "https://api.resend.com/emails"


class EmailError(RuntimeError):
    """The provider rejected or failed to accept the message."""


class Mailer(Protocol):
    def send(
        self, *, to: str, subject: str, html: str, text: str
    ) -> str: ...  # returns a provider message id


class ResendMailer:
    def __init__(self, api_key: str, from_address: str, timeout: float = 20.0) -> None:
        self.api_key = api_key
        self.from_address = from_address
        self.timeout = timeout

    def send(self, *, to: str, subject: str, html: str, text: str) -> str:
        try:
            response = requests.post(
                RESEND_ENDPOINT,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": self.from_address,
                    "to": [to],
                    "subject": subject,
                    "html": html,
                    "text": text,
                },
                timeout=self.timeout,
            )
        except requests.RequestException as exc:
            raise EmailError(f"could not reach Resend: {exc}") from exc

        if response.status_code >= 400:
            raise EmailError(f"Resend returned {response.status_code}: {response.text[:400]}")

        return response.json().get("id", "")


class ConsoleMailer:
    """Prints instead of sending. What `--dry-run` uses."""

    def __init__(self) -> None:
        self.sent: list[dict[str, str]] = []

    def send(self, *, to: str, subject: str, html: str, text: str) -> str:
        self.sent.append({"to": to, "subject": subject, "html": html, "text": text})
        print(f"\n--- would email {to} ---")
        print(f"Subject: {subject}\n")
        print(text)
        return f"dry-run-{len(self.sent)}"
