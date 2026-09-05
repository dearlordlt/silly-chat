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
import unicodedata
from dataclasses import dataclass

import httpx

from app import runtime
from app.config import get_settings
from app.logging_setup import describe_exc, get_logger, pv

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


# Words too common to prove a result is about anything in particular.
_STOP = {
    "the", "and", "for", "was", "were", "are", "did", "does", "have", "has", "had",
    "what", "when", "where", "which", "who", "why", "how", "with", "from", "into",
    "that", "this", "they", "them", "their", "there", "than", "then", "not", "but",
    "can", "could", "would", "should", "about", "over", "under", "between", "during",
    "its", "his", "her", "our", "your", "you", "any", "all", "some", "more", "most",
    "also", "such", "used", "use", "using", "vs", "versus", "language", "history",
    "year", "years", "first", "new", "old",
}


def _fold(text: str) -> str:
    """Lowercase, strip diacritics — 'Mažvydas' and 'Mazvydas' must match."""
    return "".join(
        c for c in unicodedata.normalize("NFKD", (text or "").lower()) if not unicodedata.combining(c)
    )


def _terms(query: str) -> list[str]:
    """The words that make a query distinctive."""
    return [w for w in re.findall(r"[a-z0-9]+", _fold(query)) if len(w) > 2 and w not in _STOP]


def _relevant(query: str, results: list, text_of) -> list:
    """Drop results that have nothing to do with what was asked.

    Search engines answer datacenter IPs with junk when they don't want to answer
    properly: seen live, 'Mazvydas 1547 catechism' came back as Chrome help pages in
    eight languages, and a question about the Grand Duchy came back as porn-site
    search pages. Cited as sources, that junk also lands in the model's context and
    it will happily reason from it. A result must share at least a couple of the
    query's distinctive words with its title, snippet or URL — an intentionally low
    bar that genuine results clear easily and unrelated pages cannot.
    """
    terms = _terms(query)
    if not terms:
        return results
    need = min(2, len(terms))
    kept = []
    for r in results:
        hay = _fold(text_of(r))
        if sum(1 for t in set(terms) if t in hay) >= need:
            kept.append(r)
    if len(kept) != len(results):
        log.info(
            "dropped %d/%d off-topic result(s) for %s",
            len(results) - len(kept), len(results), pv(query),
        )
    return kept


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
        runtime.note_search(True)
        return resp.json()
    except httpx.HTTPError as exc:
        # 402/429/403 = credit spent, spend cap, or rate limit. SearXNG picks up the
        # slack, but its results are far worse — so this is recorded for Admin →
        # Search rather than left to be discovered through bad answers.
        log.warning("brave search failed (%s): %s — falling back to searxng", path, describe_exc(exc))
        runtime.note_search(False, _why(exc))
        return None


def _why(exc: httpx.HTTPError) -> str:
    code = exc.response.status_code if isinstance(exc, httpx.HTTPStatusError) else 0
    return {
        402: "Payment required — the monthly free credit is spent, or billing needs attention.",
        429: "Rate limited — too many requests for this plan.",
        403: "Rejected — the key looks invalid, expired or revoked.",
        401: "Rejected — the key looks invalid, expired or revoked.",
    }.get(code, f"Unreachable ({type(exc).__name__}).")


async def _query(params: dict, pick) -> list:
    """Query SearXNG. ``searxng_url`` may be a comma-separated failover list —
    e.g. a home instance over Tailscale (residential IP = engines don't block it)
    first, the local container second.

    ``pick`` turns one instance's JSON into the results worth using, so the chain
    falls through on *usable* results rather than on raw ones. That distinction
    matters: an instance whose engines answer with off-topic filler returns a full
    results array, which would otherwise end the chain and then be filtered down to
    nothing — leaving a healthy fallback unasked. Empty results fall through too
    (that's how engine suspensions look).
    """
    bases = [u.strip().rstrip("/") for u in get_settings().search.searxng_url.split(",") if u.strip()]
    async with httpx.AsyncClient(timeout=20.0) as client:
        for i, base in enumerate(bases):
            try:
                resp = await client.get(f"{base}/search", params={**params, "format": "json"})
                resp.raise_for_status()
                data = resp.json()
            except httpx.HTTPError as exc:
                log.warning("searxng %s failed: %s", base, describe_exc(exc))
                continue
            out = pick(data)
            if out:
                if i > 0:
                    log.info("searxng fallback #%d (%s) answered", i + 1, base)
                return out
            if data.get("results"):
                log.info("searxng %s answered with nothing on topic — trying the next", base)
    return []


def _text_of(r: TextResult) -> str:
    return f"{r.title} {r.snippet} {r.url}"


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
        out = _relevant(query, out, _text_of)
        if out:
            return out

    def pick(data: dict) -> list[TextResult]:
        out = [
            TextResult(
                title=r.get("title", ""),
                url=r.get("url", ""),
                snippet=r.get("content", ""),
            )
            for r in data.get("results", [])[:limit]
        ]
        return _relevant(query, out, _text_of)

    try:
        return await _query({"q": query}, pick)
    except httpx.HTTPError as exc:
        log.warning("searxng text search failed for %s: %s", pv(query), describe_exc(exc))
        return []


def _img_of(r: ImageResult) -> str:
    return f"{r.title} {r.source_url}"


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
        out = _relevant(query, out, _img_of)
        if out:
            return out

    def pick(data: dict) -> list[ImageResult]:
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
        return _relevant(query, out, _img_of)

    try:
        return await _query({"q": query, "categories": "images"}, pick)
    except httpx.HTTPError as exc:
        log.warning("searxng image search failed for %s: %s", pv(query), describe_exc(exc))
        return []
