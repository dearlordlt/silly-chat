"""Ollama model wiring — the one place models are constructed.

Reads endpoint + key + model names from ``settings`` (config.toml / .env). Nothing
else in the codebase should name a model or build a provider.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_ai.models.ollama import OllamaModel
from pydantic_ai.providers.ollama import OllamaProvider

from app.config import get_settings


@lru_cache
def _provider() -> OllamaProvider:
    s = get_settings()
    return OllamaProvider(base_url=s.ollama.base_url, api_key=s.ollama_api_key)


def model(name: str) -> OllamaModel:
    """Build an OllamaModel for a concrete model name."""
    return OllamaModel(name, provider=_provider())


def orchestrator_model() -> OllamaModel:
    return model(get_settings().models.orchestrator)


def worker_model() -> OllamaModel:
    return model(get_settings().models.worker)


def vision_model() -> OllamaModel:
    return model(get_settings().models.vision)
