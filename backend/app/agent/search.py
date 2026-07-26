"""Web search — Brave Search API primary, SearXNG fallback.

When an admin configures a Brave key (Admin → Search, or BRAVE_API_KEY in .env),
text and image searches go to Brave's API — built for programmatic use, so no
CAPTCHAs or engine suspensions. Without a key, or whenever Brave errors or
returns nothing (e.g. the monthly spend cap paused the subscription), the query
falls back to SearXNG exactly as before. Degrades gracefully: if everything is
unreachable, returns an empty list so the agent can still respond.

SearXNG requires an instance with ``json`` enabled in formats.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass

import httpx

from app import runtime
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


def _clean(text: str) -> str:
    """Brave snippets carry <strong> highlighting and entities — plain text out."""
    return html.unescape(re.sub(r"<[^>]+>", "", text or ""))


async def _brave(path: str, params: dict) -> dict | None:
    """One Brave API call; None = unusable (no key, error, or capped) → fall back."""
    key = runtime.brave_api_key()
    if not key:
        return None
    base = get_settings().search.brave_base_url.rstrip("/")
    headers = {"X-Subscription-Token": key, "Accept": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(f"{base}{path}", params=params, headers=headers)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPError as exc:
        # 429/403 = rate/spend cap reached — expected near month's end on the
        # free tier; SearXNG picks up the slack.
        log.warning("brave search failed (%s): %s — falling back to searxng", path, exc)
        return None


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
    data = await _brave("/web/search", {"q": query, "count": limit})
    if data is not None:
        out = [
            TextResult(
                title=_clean(r.get("title", "")),
                url=r.get("url", ""),
                snippet=_clean(r.get("description", "")),
            )
            for r in (data.get("web") or {}).get("results", [])[:limit]
            if r.get("url")
        ]
        if out:
            return out
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
    data = await _brave("/images/search", {"q": query, "count": limit})
    if data is not None:
        out = [
            ImageResult(
                title=_clean(r.get("title", "")),
                image_url=(r.get("properties") or {}).get("url") or (r.get("thumbnail") or {}).get("src", ""),
                source_url=r.get("url", ""),
            )
            for r in data.get("results", [])[:limit]
        ]
        out = [r for r in out if r.image_url]
        if out:
            return out
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
