"""Image generation via OpenRouter's Images API.

The API key is admin-managed at runtime (Admin → Images, stored in AppSetting) —
never in config or env. The default model comes from config.toml ``[images]``;
admins can pick any model the OpenRouter image catalog offers.
"""

from __future__ import annotations

import base64

import httpx

from app import runtime
from app.config import get_settings

_MIME_EXT = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg"}


class ImageGenError(Exception):
    """Human-readable failure the tool surfaces back to the model."""


def ext_for(mime: str) -> str:
    return _MIME_EXT.get(mime, "png")


def _error_detail(resp: httpx.Response) -> str:
    try:
        detail = resp.json().get("error", {}).get("message", "")
    except ValueError:
        detail = ""
    return str(detail or resp.text or resp.reason_phrase)[:200]


async def _request_image(body: dict, retry_without: str = "") -> tuple[bytes, str]:
    """POST one Images-API request; returns (bytes, mime). Raises ImageGenError."""
    cfg = get_settings().images
    key = runtime.image_api_key()
    if not key:
        raise ImageGenError("no OpenRouter API key is configured (Admin → Images)")
    url = cfg.base_url.rstrip("/") + "/images"
    async with httpx.AsyncClient(timeout=float(cfg.timeout_s)) as client:
        resp = await client.post(url, headers={"Authorization": f"Bearer {key}"}, json=body)
        if resp.status_code == 400 and retry_without and retry_without in body:
            # Not every model accepts every optional field — retry plain before giving up.
            body.pop(retry_without)
            resp = await client.post(url, headers={"Authorization": f"Bearer {key}"}, json=body)
    if resp.status_code != 200:
        raise ImageGenError(f"OpenRouter said {resp.status_code}: {_error_detail(resp)}")
    try:
        item = resp.json()["data"][0]
        return base64.b64decode(item["b64_json"]), str(item.get("media_type") or "image/png")
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise ImageGenError(f"unexpected OpenRouter response: {exc}") from exc


async def generate(prompt: str, aspect_ratio: str = "", model: str | None = None) -> tuple[bytes, str]:
    """Generate one image; returns (bytes, mime). Raises ImageGenError on failure."""
    body: dict = {"model": model or runtime.image_model(), "prompt": prompt, "n": 1}
    if aspect_ratio:
        body["aspect_ratio"] = aspect_ratio
    return await _request_image(body, retry_without="aspect_ratio")


async def edit(instruction: str, image: bytes, mime: str, model: str | None = None) -> tuple[bytes, str]:
    """Image-to-image: apply an edit instruction to a source image (sent as a base64
    data URL via input_references). Returns (bytes, mime)."""
    data_url = f"data:{mime or 'image/png'};base64,{base64.b64encode(image).decode()}"
    body: dict = {
        "model": model or runtime.image_model_edit(),
        "prompt": instruction,
        "n": 1,
        "input_references": [{"type": "image_url", "image_url": {"url": data_url}}],
    }
    return await _request_image(body)


async def available_image_models() -> list[dict]:
    """Image-capable models on OpenRouter (for the admin picker), as
    {id, name, edits} sorted by display name — edits=True when the model also
    accepts image INPUT (usable for image-to-image). Empty on error. The
    /images/models catalog only contains models that can OUTPUT images."""
    cfg = get_settings().images
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(cfg.base_url.rstrip("/") + "/images/models")
            resp.raise_for_status()
            data = resp.json()
        entries = data.get("data", data) if isinstance(data, dict) else data
        out = []
        for m in entries:
            if not (isinstance(m, dict) and m.get("id")):
                continue
            arch = m.get("architecture") or {}
            out.append(
                {
                    "id": m["id"],
                    "name": str(m.get("name") or m["id"]),
                    "edits": "image" in (arch.get("input_modalities") or []),
                }
            )
        return sorted(out, key=lambda m: m["name"].lower())
    except (httpx.HTTPError, KeyError, TypeError, ValueError):
        return []
