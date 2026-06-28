"""Image fetching for vision.

Ollama's endpoint needs raw image bytes (it rejects URLs), and many hosts block
hotlinking without a real User-Agent. This helper centralizes both lessons.
"""

from __future__ import annotations

import httpx

_UA = "silly-chat/0.1 (+https://github.com/dearlordlt/silly-chat)"

_MAGIC = (b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n", b"GIF8", b"RIFF")


class ImageFetchError(RuntimeError):
    pass


def guess_media_type(data: bytes) -> str:
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"GIF8":
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return "image/jpeg"


async def fetch_image_bytes(url: str, *, timeout: float = 20.0) -> bytes:
    """Download an image and verify it actually is one. Raises ImageFetchError."""
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": _UA})
            resp.raise_for_status()
            data = resp.content
    except httpx.HTTPError as exc:
        raise ImageFetchError(f"download failed: {exc}") from exc
    if not data.startswith(_MAGIC):
        raise ImageFetchError(f"not a valid image ({len(data)} bytes)")
    return data
