"""Single source of truth for all runtime configuration.

Non-secret values come from ``config.toml`` (repo root); the only secret,
``OLLAMA_API_KEY``, comes from ``.env`` / the environment. Nothing in the
codebase should hardcode a model name, URL, or cap — read it from ``settings``.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel
from pydantic_settings import (
    BaseSettings,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
    TomlConfigSettingsSource,
)

# Repo root = two levels up from backend/app/config.py
ROOT = Path(__file__).resolve().parents[2]


class OllamaCfg(BaseModel):
    base_url: str = "http://localhost:11434/v1"


class ModelsCfg(BaseModel):
    orchestrator: str
    worker: str
    vision: str
    coder: str
    embed: str  # embedding model for document RAG


class SearchCfg(BaseModel):
    searxng_url: str = "http://localhost:8080"


class LimitsCfg(BaseModel):
    max_vision_candidates: int = 5
    max_confirmed_hits: int = 3
    max_agents: int = 4  # most parallel research workers per turn
    # Hard backstop on model round-trips per research worker (≈ this many web searches)
    # so a worker can't loop dozens of searches and stall the turn.
    worker_request_limit: int = 8
    user_requests_per_minute: int = 20
    # Retries for tool calls + structured-output validation (the "repair pass").
    output_retries: int = 4
    # Code-preview hosting (open-in-new-tab). Kept deliberately tight: previews are
    # owner-only, expire fast, and are size/count capped so we can't be abused as a host.
    preview_ttl_minutes: int = 30
    preview_max_kb: int = 2048
    preview_max_per_user: int = 20
    # Attachments (images now; docs later). Images are recompressed on ingest, so disk
    # use stays small; quotas + TTL are the backstops that keep the 50 GB box clean.
    upload_max_mb: int = 10  # reject a single upload larger than this (pre-compression)
    upload_image_max_dim: int = 1568  # downscale longest side to this before storing
    upload_user_quota_mb: int = 200  # per-user ceiling
    upload_global_quota_mb: int = 20000  # whole-app ceiling (LRU-evict when exceeded)
    upload_ttl_days: int = 7  # delete uploads (rows + chunks) older than this
    # Documents (RAG): originals are heavy, so they're purged fast; the extracted text
    # chunks + embeddings (tiny) live on for upload_ttl_days so the chat keeps its context.
    doc_max_mb: int = 25  # reject a single document larger than this
    doc_file_ttl_days: int = 1  # purge the original file this soon (chunks/context remain)
    doc_chunk_chars: int = 1200  # ~chunk size for embedding
    doc_chunk_overlap: int = 200
    doc_max_chars: int = 400_000  # cap extracted text so a huge file can't explode RAG
    rag_top_k: int = 6  # passages returned per search_document call


class DbCfg(BaseModel):
    # SQLite file, resolved relative to repo root.
    path: str = "data/silly.db"


class AuthCfg(BaseModel):
    session_days: int = 30


class LoggingCfg(BaseModel):
    level: str = "INFO"  # DEBUG for verbose tool/search tracing


class Settings(BaseSettings):
    """The one config object. Inject via ``get_settings()``."""

    model_config = SettingsConfigDict(
        env_file=ROOT / ".env",
        env_file_encoding="utf-8",
        toml_file=ROOT / "config.toml",
        # Allow nested overrides from the environment, e.g. OLLAMA__BASE_URL=...
        # (used by docker-compose to point the container at host/cloud Ollama
        # without editing config.toml).
        env_nested_delimiter="__",
        extra="ignore",
    )

    # Secrets — from env / .env only.
    ollama_api_key: str = "ollama"
    session_secret: str = "dev-insecure-change-me"

    # Non-secret — from config.toml.
    ollama: OllamaCfg = OllamaCfg()
    models: ModelsCfg
    search: SearchCfg = SearchCfg()
    limits: LimitsCfg = LimitsCfg()
    db: DbCfg = DbCfg()
    auth: AuthCfg = AuthCfg()
    logging: LoggingCfg = LoggingCfg()

    @property
    def db_file(self) -> Path:
        p = Path(self.db.path)
        return p if p.is_absolute() else ROOT / p

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        # Precedence: env > .env > config.toml > field defaults.
        return (
            init_settings,
            env_settings,
            dotenv_settings,
            TomlConfigSettingsSource(settings_cls),
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
