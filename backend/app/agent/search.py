"""SearXNG client — text and image search via the JSON API.

Requires a SearXNG instance with ``json`` enabled in formats. Degrades gracefully:
if SearXNG is unreachable, returns an empty list so the agent can still respond.
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.config import get_settings
from app.logging_setup import get_logger

log = get_logger("search")


@dataclass
class TextResult:
    title: str
    url: str
    snippet: str


@dataclass
class ImageResult:
    title: str
    image_url: str
    source_url: str


async def _query(params: dict) -> dict:
    """Query SearXNG. ``searxng_url`` may be a comma-separated failover list —
    e.g. a home instance over Tailscale (residential IP = engines don't block it)
    first, the local container second. First instance that yields results wins;
    empty results also fall through (that's how engine suspensions look)."""
    bases = [u.strip().rstrip("/") for u in get_settings().search.searxng_url.split(",") if u.strip()]
    last: dict = {}
    async with httpx.AsyncClient(timeout=20.0) as client:
        for i, base in enumerate(bases):
            try:
                resp = await client.get(f"{base}/search", params={**params, "format": "json"})
                resp.raise_for_status()
                data = resp.json()
            except httpx.HTTPError as exc:
                log.warning("searxng %s failed: %s", base, exc)
                continue
            if data.get("results"):
                if i > 0:
                    log.info("searxng fallback #%d (%s) answered", i + 1, base)
                return data
            last = data
    return last


async def search_text(query: str, limit: int = 8) -> list[TextResult]:
    try:
        data = await _query({"q": query})
    except httpx.HTTPError as exc:
        log.warning("searxng text search failed for %r: %s", query[:60], exc)
        return []
    out = []
    for r in data.get("results", [])[:limit]:
        out.append(TextResult(
            title=r.get("title", ""),
            url=r.get("url", ""),
            snippet=r.get("content", ""),
        ))
    return out


async def search_images(query: str, limit: int = 12) -> list[ImageResult]:
    try:
        data = await _query({"q": query, "categories": "images"})
    except httpx.HTTPError as exc:
        log.warning("searxng image search failed for %r: %s", query[:60], exc)
        return []
    out = []
    for r in data.get("results", [])[:limit]:
        img = r.get("img_src") or r.get("thumbnail_src")
        if not img:
            continue
        out.append(ImageResult(
            title=r.get("title", ""),
            image_url=img,
            source_url=r.get("url", ""),
        ))
    return out
