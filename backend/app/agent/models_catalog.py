"""List the models the configured Ollama endpoint exposes (for the admin picker)."""

from __future__ import annotations

import httpx

from app.config import get_settings


async def available_models() -> list[str]:
    s = get_settings()
    url = s.ollama.base_url.rstrip("/") + "/models"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers={"Authorization": f"Bearer {s.ollama_api_key}"})
            resp.raise_for_status()
            data = resp.json()
        return sorted(m["id"] for m in data.get("data", []) if m.get("id"))
    except (httpx.HTTPError, KeyError, ValueError):
        return []
