"""Ollama model wiring — the one place models are constructed.

Reads endpoint + key + model names from ``settings`` (config.toml / .env). Nothing
else in the codebase should name a model or build a provider.
"""

from __future__ import annotations

from functools import lru_cache

import httpx
from pydantic_ai.models.ollama import OllamaModel
from pydantic_ai.providers.ollama import OllamaProvider

from app.config import get_settings
from app.logging_setup import get_logger

log = get_logger("ollama")


@lru_cache
def _provider() -> OllamaProvider:
    s = get_settings()
    return OllamaProvider(base_url=s.ollama.base_url, api_key=s.ollama_api_key)


# model name -> raw /api/show payload, the source for context window and
# capabilities. Only successful probes are cached: a transient failure must not
# quietly pin "no capabilities" (= no native vision) until the next restart.
_show_cache: dict[str, dict] = {}


async def _show(name: str) -> dict:
    """The Ollama /api/show metadata for a model (works for the local daemon and
    Ollama Cloud alike). {} when the endpoint doesn't answer (not cached)."""
    if name in _show_cache:
        return _show_cache[name]
    s = get_settings()
    base = s.ollama.base_url.removesuffix("/v1").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(
                f"{base}/api/show",
                json={"model": name},
                headers={"Authorization": f"Bearer {s.ollama_api_key}"},
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        log.info("model metadata lookup failed for %s: %s", name, exc)
        return {}
    _show_cache[name] = data
    return data


async def context_window(name: str) -> int | None:
    """The model's context window per its metadata; None when unreported."""
    info = (await _show(name)).get("model_info", {})
    for key, val in info.items():
        if key.endswith(".context_length") and isinstance(val, int):
            return val
    return None


async def capabilities(name: str) -> list[str]:
    """The model's capability tags ("completion", "vision", "tools", …). [] when
    the endpoint doesn't report them — callers must treat that as 'can't see',
    so a probe failure safely falls back to the look-tool vision path."""
    caps = (await _show(name)).get("capabilities", [])
    return [c for c in caps if isinstance(c, str)]


def model(name: str) -> OllamaModel:
    """Build an OllamaModel for a concrete model name."""
    return OllamaModel(name, provider=_provider())


def orchestrator_model() -> OllamaModel:
    from app import runtime

    return model(runtime.model_for("orchestrator"))


def worker_model() -> OllamaModel:
    from app import runtime

    return model(runtime.model_for("worker"))


def vision_model() -> OllamaModel:
    from app import runtime

    return model(runtime.model_for("vision"))


def coder_model() -> OllamaModel:
    from app import runtime

    return model(runtime.model_for("coder"))
