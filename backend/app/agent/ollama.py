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


# model name -> context window (tokens), from the Ollama /api/show metadata.
# None is cached too: an unreachable endpoint shouldn't be re-probed every turn.
_ctx_cache: dict[str, int | None] = {}


async def context_window(name: str) -> int | None:
    """The model's context window per Ollama's own metadata (works for the local
    daemon and Ollama Cloud alike). None when the endpoint doesn't report it."""
    if name in _ctx_cache:
        return _ctx_cache[name]
    s = get_settings()
    base = s.ollama.base_url.removesuffix("/v1").rstrip("/")
    value: int | None = None
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(
                f"{base}/api/show",
                json={"model": name},
                headers={"Authorization": f"Bearer {s.ollama_api_key}"},
            )
            resp.raise_for_status()
            info = resp.json().get("model_info", {})
            for key, val in info.items():
                if key.endswith(".context_length") and isinstance(val, int):
                    value = val
                    break
    except Exception as exc:
        log.info("context window lookup failed for %s: %s", name, exc)
    _ctx_cache[name] = value
    return value


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
