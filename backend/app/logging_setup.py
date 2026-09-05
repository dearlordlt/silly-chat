"""Lightweight, readable logging for the app's own ``silly.*`` loggers.

Kept separate from uvicorn's handlers (propagate=False) so our logs have a clean,
consistent format and don't double-print.

Privacy line (same as usage.py): logs carry *shape* — lengths, counts, types,
status codes, durations — never user or model *content*. ``pv()`` and
``describe_exc()`` are the only sanctioned ways to reference content-bearing
values in a log call. ``[logging].content = true`` (dev only) restores verbatim
text for local debugging.
"""

from __future__ import annotations

import logging
import sys

import httpx

_ROOT = "silly"
_content = False


def pv(text: object) -> str:
    """Privacy value: render content-bearing text as its shape only.

    ``[57 chars]`` in normal operation; the verbatim (truncated) text when
    content logging is enabled. No hashes — short messages would be guessable.
    """
    if text is None:
        return "[none]"
    s = text if isinstance(text, str) else str(text)
    if _content:
        return repr(s[:120])
    return f"[{len(s)} chars]"


def describe_exc(exc: BaseException) -> str:
    """Exception summary safe to log: type + status + host, never URLs/bodies.

    httpx exception strings embed the full request URL (search queries, route
    coordinates live in query strings and paths) and provider error bodies can
    echo prompts — so str(exc) only appears when content logging is on.
    """
    name = type(exc).__name__
    if isinstance(exc, httpx.HTTPStatusError):
        safe = f"{name} {exc.response.status_code} host={exc.request.url.host}"
    elif isinstance(exc, httpx.RequestError):
        host = exc.request.url.host if exc.request is not None else "?"
        safe = f"{name} host={host}"
    else:
        safe = name
    if _content:
        safe += f": {str(exc)[:300]}"
    return safe


class _AccessFilter(logging.Filter):
    """Scrub uvicorn's access log: drop health-check noise, redact client IPs.

    uvicorn.access record args are (client_addr, method, path, http_version,
    status); nothing in the app uses client IPs, so they never belong in logs.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if isinstance(args, tuple) and len(args) == 5:
            if args[2] == "/api/health":
                return False
            record.args = ("-", *args[1:])
        return True


def setup_logging(level: str = "INFO", *, content: bool = False) -> None:
    global _content
    _content = content
    logger = logging.getLogger(_ROOT)
    logger.setLevel(level.upper())
    logger.propagate = False
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stderr)
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s %(levelname)-7s %(name)s | %(message)s", "%Y-%m-%d %H:%M:%S"
            )
        )
        logger.addHandler(handler)
    access = logging.getLogger("uvicorn.access")
    if not any(isinstance(f, _AccessFilter) for f in access.filters):
        access.addFilter(_AccessFilter())
    if content:
        logger.warning("content logging is ON — logs will contain message text (dev only!)")


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(f"{_ROOT}.{name}")
