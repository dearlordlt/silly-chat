"""Direct xAI (Grok) API wrapper — https://api.x.ai/v1.

A second image provider next to OpenRouter: models picked in Admin → Images carry
an ``xai:`` prefix (e.g. ``xai:grok-imagine-image``) and route here instead.
The API key is admin-managed (Admin → Images, stored in AppSetting) with the
``XAI_API_KEY`` env var as a fallback — never in config files.

Kept deliberately generic: ``_get``/``_post`` handle auth + errors for ANY xAI
endpoint, so future uses (chat models, grok-imagine-video) are one function away.
Verified against the live API: POST /images/generations accepts ``prompt``,
``image_url`` (data URL, for loose reference/img2img), ``aspect_ratio``; POST
/images/edits takes ``image: {url: <data URL>}`` and actually PRESERVES the
source (true editing — reference generation reinvents the subject). Both return
``data[{b64_json, mime_type}]``.
"""

from __future__ import annotations

import base64
from typing import Any

import httpx

from app import runtime
from app.config import get_settings

PREFIX = "xai:"


class XaiError(Exception):
    """Human-readable failure the caller surfaces back to the model."""


def is_xai(model: str) -> bool:
    return model.startswith(PREFIX)


def _base() -> str:
    return get_settings().images.xai_base_url.rstrip("/")


def _headers() -> dict[str, str]:
    key = runtime.xai_api_key()
    if not key:
        raise XaiError("no xAI API key is configured (Admin → Images)")
    return {"Authorization": f"Bearer {key}"}


def _error_detail(resp: httpx.Response) -> str:
    try:
        body = resp.json()
        detail = body.get("error") or body.get("message") or ""
        if isinstance(detail, dict):
            detail = detail.get("message", "")
    except ValueError:
        detail = ""
    return str(detail or resp.text or resp.reason_phrase)[:200]


async def _post(path: str, body: dict[str, Any], timeout: float | None = None) -> dict:
    async with httpx.AsyncClient(timeout=timeout or float(get_settings().images.timeout_s)) as client:
        resp = await client.post(_base() + path, headers=_headers(), json=body)
    if resp.status_code != 200:
        raise XaiError(f"xAI said {resp.status_code}: {_error_detail(resp)}")
    return resp.json()


async def _get(path: str, timeout: float = 10.0) -> dict:
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.get(_base() + path, headers=_headers())
    if resp.status_code != 200:
        raise XaiError(f"xAI said {resp.status_code}: {_error_detail(resp)}")
    return resp.json()


async def generate_image(
    prompt: str,
    model: str,
    aspect_ratio: str = "",
    reference: tuple[bytes, str] | None = None,
) -> tuple[bytes, str]:
    """One image from a Grok image model; returns (bytes, mime).

    ``model`` may carry the ``xai:`` prefix or not. ``reference`` = (bytes, mime)
    of an image the result should match/edit — sent as a data URL.
    """
    body: dict[str, Any] = {
        "model": model.removeprefix(PREFIX),
        "prompt": prompt,
        "n": 1,
        "response_format": "b64_json",
    }
    if aspect_ratio:
        body["aspect_ratio"] = aspect_ratio
    if reference is not None:
        data, mime = reference
        body["image_url"] = f"data:{mime or 'image/png'};base64,{base64.b64encode(data).decode()}"
    out = await _post("/images/generations", body)
    try:
        item = out["data"][0]
        return base64.b64decode(item["b64_json"]), str(item.get("mime_type") or "image/jpeg")
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise XaiError(f"unexpected xAI response: {exc}") from exc


async def edit_image(
    prompt: str,
    model: str,
    image: bytes,
    mime: str,
) -> tuple[bytes, str]:
    """True image editing via /images/edits — the source is preserved and only the
    requested change applied (unlike generate_image with a reference, which treats
    the image as loose inspiration). Returns (bytes, mime)."""
    body: dict[str, Any] = {
        "model": model.removeprefix(PREFIX),
        "prompt": prompt,
        "n": 1,
        "response_format": "b64_json",
        "image": {"url": f"data:{mime or 'image/png'};base64,{base64.b64encode(image).decode()}"},
    }
    out = await _post("/images/edits", body)
    try:
        item = out["data"][0]
        return base64.b64decode(item["b64_json"]), str(item.get("mime_type") or "image/jpeg")
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise XaiError(f"unexpected xAI response: {exc}") from exc


async def image_models() -> list[dict]:
    """Grok image models for the admin picker: {id, name, edits} with the ``xai:``
    prefix baked into the id. Both current models accept image input (edits=True).
    Empty list on error — the picker just shows OpenRouter models then."""
    try:
        out = await _get("/image-generation-models")
        models = out.get("models", [])
    except Exception:
        return []
    return sorted(
        (
            {
                "id": PREFIX + m["id"],
                "name": f"Grok direct — {m['id']}",
                "edits": "image" in (m.get("input_modalities") or []),
            }
            for m in models
            if isinstance(m, dict) and m.get("id")
        ),
        key=lambda m: m["name"].lower(),
    )
