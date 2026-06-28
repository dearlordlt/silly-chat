"""Current date/time for prompt injection, so the model grounds 'now' correctly.

Defaults to the server's local time. If the user opted to share their timezone, the
request carries an IANA name (e.g. "Europe/Vilnius") and we format in that zone.
"""

from __future__ import annotations

from contextvars import ContextVar
from datetime import datetime

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None  # type: ignore

# Set per turn from the request (None = use server local time). Read by worker agents.
tz_var: ContextVar[str | None] = ContextVar("tz", default=None)


def now_str(tz: str | None = None) -> str:
    dt = datetime.now()
    if tz and ZoneInfo is not None:
        try:
            dt = datetime.now(ZoneInfo(tz))
        except Exception:
            pass  # unknown zone -> fall back to server local time
    return dt.strftime("%A, %d %B %Y, %H:%M")
