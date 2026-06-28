"""Dynamic HTML preview hosting.

Generated HTML is stashed in memory and served at /api/preview/{id} so it can be
opened in a real tab (locally or deployed) without spinning anything up. The page is
sandboxed via a CSP so it runs scripts but cannot reach our cookies or API.
"""

from __future__ import annotations

import uuid
from collections import OrderedDict

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from app.auth.deps import ApprovedUser

router = APIRouter(prefix="/api/preview", tags=["preview"])

_MAX = 200
_previews: "OrderedDict[str, str]" = OrderedDict()

# Sandbox the served page: scripts run, but it's an opaque origin — no access to our
# cookies, storage, or same-origin API.
_SANDBOX_CSP = "sandbox allow-scripts allow-popups allow-modals allow-forms allow-pointer-lock"


class PreviewIn(BaseModel):
    html: str


@router.post("")
def create_preview(body: PreviewIn, _: ApprovedUser) -> dict:
    pid = uuid.uuid4().hex
    _previews[pid] = body.html
    while len(_previews) > _MAX:
        _previews.popitem(last=False)  # evict oldest
    return {"id": pid}


@router.get("/{pid}")
def serve_preview(pid: str) -> HTMLResponse:
    html = _previews.get(pid)
    if html is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "preview not found")
    return HTMLResponse(html, headers={"Content-Security-Policy": _SANDBOX_CSP})
