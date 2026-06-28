"""Current date/time for prompt injection, so the model grounds 'now' correctly."""

from __future__ import annotations

from datetime import datetime


def now_str() -> str:
    return datetime.now().strftime("%A, %d %B %Y, %H:%M")
