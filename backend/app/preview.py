"""Dynamic HTML preview hosting — locked down so we can't be abused as a host.

Generated HTML is stashed in memory and served at /api/preview/{id} so it can be
opened in a real tab (locally or deployed) without spinning anything up.

Threat we care about: an open, anonymous HTML host on our domain is a gift to
phishers/malware (our domain's reputation, served to arbitrary victims). So:

  * Creating a preview requires an approved account (already trusted people).
  * Viewing requires being logged in AND owning the preview — a leaked URL handed
    to a stranger hits a login wall, then a 404. We are never a host for the public.
  * Previews are temporary (TTL) and size/count capped — no durable, growable store.
  * The served page is sandboxed via CSP (opaque origin): no access to our cookies,
    storage, or same-origin API even though the viewer is authenticated. Plus
    noindex / no-referrer / nosniff so search engines never surface it and links
    don't leak the URL onward.
"""

from __future__ import annotations

import time
import uuid
from collections import OrderedDict
from dataclasses import dataclass

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from app.auth.deps import ApprovedUser
from app.config import get_settings

router = APIRouter(prefix="/api/preview", tags=["preview"])

# Global backstop so the store can never grow unbounded regardless of per-user caps.
_MAX = 500


@dataclass
class _Entry:
    html: str
    owner_id: int
    expires_at: float  # time.monotonic() deadline


_previews: "OrderedDict[str, _Entry]" = OrderedDict()

# Sandbox the served page: scripts run, but it's an opaque origin — no access to our
# cookies, storage, or same-origin API. Paired with headers that keep it un-indexed
# and prevent the URL leaking via Referer to anything the page links out to.
_SANDBOX_CSP = "sandbox allow-scripts allow-popups allow-modals allow-forms allow-pointer-lock"
_HEADERS = {
    "Content-Security-Policy": _SANDBOX_CSP,
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
    "Cross-Origin-Resource-Policy": "same-origin",
}


def _sweep(now: float) -> None:
    """Drop expired entries. Cheap: the store is small and capped."""
    dead = [pid for pid, e in _previews.items() if e.expires_at <= now]
    for pid in dead:
        del _previews[pid]


class PreviewIn(BaseModel):
    html: str


@router.post("")
def create_preview(body: PreviewIn, user: ApprovedUser) -> dict:
    cfg = get_settings().limits
    if len(body.html.encode("utf-8")) > cfg.preview_max_kb * 1024:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "preview too large")

    now = time.monotonic()
    _sweep(now)

    # Per-user cap: evict this user's oldest live previews to make room.
    mine = [pid for pid, e in _previews.items() if e.owner_id == user.id]
    while len(mine) >= cfg.preview_max_per_user:
        del _previews[mine.pop(0)]

    pid = uuid.uuid4().hex
    _previews[pid] = _Entry(
        html=body.html,
        owner_id=user.id,
        expires_at=now + cfg.preview_ttl_minutes * 60,
    )
    while len(_previews) > _MAX:
        _previews.popitem(last=False)  # global backstop: evict oldest
    return {"id": pid}


@router.get("/{pid}")
def serve_preview(pid: str, user: ApprovedUser) -> HTMLResponse:
    entry = _previews.get(pid)
    # Same 404 for missing / expired / not-yours — never reveal that an id exists.
    if entry is None or entry.expires_at <= time.monotonic() or entry.owner_id != user.id:
        if entry is not None and entry.expires_at <= time.monotonic():
            del _previews[pid]
        raise HTTPException(status.HTTP_404_NOT_FOUND, "preview not found")
    return HTMLResponse(entry.html, headers=_HEADERS)
