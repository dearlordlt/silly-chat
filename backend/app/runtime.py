"""Runtime model overrides — admin-editable, layered over config.toml defaults.

config.toml provides the defaults (SSOT for first boot); admins can override the
orchestrator/worker/vision models at runtime via the admin API. Overrides persist
in the AppSetting table and are cached here for fast, sync access from the agent layer.
"""

from __future__ import annotations

from app.config import get_settings

ROLES = ("orchestrator", "worker", "vision", "coder", "embed")

_overrides: dict[str, str] = {}
_chat: dict[str, int] = {}  # runtime chat-behavior overrides (e.g. compact_pct)
_images: dict[str, str] = {}  # image generation: admin-set OpenRouter api_key + model


def load_overrides() -> None:
    from sqlmodel import Session

    from app.db import engine
    from app.models import AppSetting

    with Session(engine) as session:
        row = session.get(AppSetting, "models")
        chat_row = session.get(AppSetting, "chat")
        images_row = session.get(AppSetting, "images")
    _overrides.clear()
    if row:
        _overrides.update({k: v for k, v in row.value.items() if k in ROLES and v})
    _chat.clear()
    if chat_row:
        _chat.update({k: int(v) for k, v in chat_row.value.items() if isinstance(v, (int, float))})
    _images.clear()
    if images_row:
        # model_quality keeps an explicit "" (= disabled); other empties are noise.
        _images.update(
            {k: str(v) for k, v in images_row.value.items() if v or k == "model_quality"}
        )


def compact_pct() -> int:
    return _chat.get("compact_pct") or get_settings().limits.compact_threshold_pct


def set_chat(values: dict[str, int]) -> dict[str, int]:
    from sqlmodel import Session

    from app.db import engine
    from app.models import AppSetting

    clean = {"compact_pct": max(1, min(100, int(values.get("compact_pct", 0) or 0)))} if values.get("compact_pct") else {}
    with Session(engine) as session:
        row = session.get(AppSetting, "chat") or AppSetting(key="chat", value={})
        row.value = clean
        session.add(row)
        session.commit()
    _chat.clear()
    _chat.update(clean)
    return {"compact_pct": compact_pct()}


def image_model() -> str:
    return _images.get("model") or get_settings().images.model


def image_model_quality_setting() -> str:
    """The configured quality model as a setting: admin override wins (an explicit
    "" means 'always use the fast model'), else the config.toml default."""
    q = _images.get("model_quality")
    return q if q is not None else get_settings().images.model_quality


def image_model_quality() -> str:
    """The slow/best model for demanding asks; falls back to the fast one."""
    return image_model_quality_setting() or image_model()


def image_api_key() -> str:
    return _images.get("api_key", "")


def set_images(values: dict[str, str | None]) -> None:
    """Merge-update the image-generation settings. model/api_key: empty values are
    ignored so saving one never wipes the other. model_quality: an explicit empty
    string CLEARS it (= always use the fast model); absent/None keeps it."""
    from sqlmodel import Session

    from app.db import engine
    from app.models import AppSetting

    merged = {**_images}
    for k in ("model", "api_key"):
        v = str(values.get(k) or "").strip()
        if v:
            merged[k] = v
    if values.get("model_quality") is not None:
        # "" is stored as an explicit disable — it must beat the config default.
        merged["model_quality"] = str(values["model_quality"]).strip()
    with Session(engine) as session:
        row = session.get(AppSetting, "images") or AppSetting(key="images", value={})
        row.value = merged
        session.add(row)
        session.commit()
    _images.clear()
    _images.update(merged)


def model_for(role: str) -> str:
    return _overrides.get(role) or getattr(get_settings().models, role)


def current() -> dict[str, str]:
    return {role: model_for(role) for role in ROLES}


def set_overrides(models: dict[str, str]) -> dict[str, str]:
    from sqlmodel import Session

    from app.db import engine
    from app.models import AppSetting

    clean = {k: v for k, v in models.items() if k in ROLES and v}
    with Session(engine) as session:
        row = session.get(AppSetting, "models") or AppSetting(key="models", value={})
        row.value = clean
        session.add(row)
        session.commit()
    _overrides.clear()
    _overrides.update(clean)
    return current()
