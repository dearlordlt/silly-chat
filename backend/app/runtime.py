"""Runtime model overrides — admin-editable, layered over config.toml defaults.

config.toml provides the defaults (SSOT for first boot); admins can override the
orchestrator/worker/vision models at runtime via the admin API. Overrides persist
in the AppSetting table and are cached here for fast, sync access from the agent layer.
"""

from __future__ import annotations

from contextvars import ContextVar

from app.config import get_settings

ROLES = ("orchestrator", "worker", "vision", "coder", "embed")
# Roles that may be left unset ("") to follow the main model. Embeddings can't —
# a chat model doesn't produce embedding vectors; orchestrator IS the main model.
FOLLOW_MAIN = ("worker", "vision", "coder")

# Per-turn (per-chat) model overrides, set by stream_chat for admin test chats.
# Sits above the admin DB override: per-chat > admin global > config.toml. A
# contextvar so every model_for() consumer — agent builders, telemetry, the done
# event, the history budget — sees the effective model without threading a
# parameter through the whole call tree.
turn_overrides: ContextVar[dict[str, str]] = ContextVar("turn_overrides", default={})

_overrides: dict[str, str] = {}
_chat: dict[str, int] = {}  # runtime chat-behavior overrides (e.g. compact_pct)
_images: dict[str, str] = {}  # image generation: admin-set OpenRouter api_key + model
_search: dict[str, str] = {}  # web search: admin-set Brave Search API key


def load_overrides() -> None:
    from sqlmodel import Session

    from app.db import engine
    from app.models import AppSetting

    with Session(engine) as session:
        row = session.get(AppSetting, "models")
        chat_row = session.get(AppSetting, "chat")
        images_row = session.get(AppSetting, "images")
        search_row = session.get(AppSetting, "search")
    _overrides.clear()
    if row:
        # "" on a FOLLOW_MAIN role is an explicit setting ("same as main") that must
        # shadow a non-empty config.toml value — so empties survive for those roles.
        _overrides.update(
            {k: v for k, v in row.value.items() if k in ROLES and (v or k in FOLLOW_MAIN)}
        )
    _chat.clear()
    if chat_row:
        _chat.update({k: int(v) for k, v in chat_row.value.items() if isinstance(v, (int, float))})
    _images.clear()
    if images_row:
        # model_quality/model_edit keep an explicit "" (= disabled); other empties are noise.
        _images.update(
            {
                k: str(v)
                for k, v in images_row.value.items()
                if v or k in ("model_quality", "model_edit")
            }
        )
    _search.clear()
    if search_row:
        _search.update({k: str(v) for k, v in search_row.value.items() if v})


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


def image_model_edit_setting() -> str:
    """The configured image-editing model as a setting: admin override wins (an
    explicit "" means 'use the fast model'), else the config.toml default."""
    q = _images.get("model_edit")
    return q if q is not None else get_settings().images.model_edit


def image_model_edit() -> str:
    """The image-to-image model; falls back to the fast one (which may or may not
    accept image input — the admin picker marks the capable ones)."""
    return image_model_edit_setting() or image_model()


def image_api_key() -> str:
    return _images.get("api_key", "")


def xai_api_key() -> str:
    """Direct xAI (Grok) key: admin-pasted (AppSetting) wins, XAI_API_KEY env as
    fallback so it can also live in .env on the box."""
    import os

    return _images.get("xai_api_key", "") or os.environ.get("XAI_API_KEY", "")


def any_image_key() -> bool:
    """Is at least one image provider usable? Gates the whole image-gen feature."""
    return bool(image_api_key() or xai_api_key())


def set_images(values: dict[str, str | None]) -> None:
    """Merge-update the image-generation settings. model/api_key: empty values are
    ignored so saving one never wipes the other. model_quality: an explicit empty
    string CLEARS it (= always use the fast model); absent/None keeps it."""
    from sqlmodel import Session

    from app.db import engine
    from app.models import AppSetting

    merged = {**_images}
    for k in ("model", "api_key", "xai_api_key"):
        v = str(values.get(k) or "").strip()
        if v:
            merged[k] = v
    for k in ("model_quality", "model_edit"):
        if values.get(k) is not None:
            # "" is stored as an explicit disable — it must beat the config default.
            merged[k] = str(values[k]).strip()
    with Session(engine) as session:
        row = session.get(AppSetting, "images") or AppSetting(key="images", value={})
        row.value = merged
        session.add(row)
        session.commit()
    _images.clear()
    _images.update(merged)


def brave_api_key() -> str:
    """Brave Search API key: admin-pasted (AppSetting) wins, BRAVE_API_KEY env as
    fallback so it can also live in .env on the box. Empty = SearXNG only."""
    import os

    return _search.get("brave_api_key", "") or os.environ.get("BRAVE_API_KEY", "")


# Why the answers went bad, in one line, for Admin → Search. A key that stops working
# (spent credit, spend cap, revoked) otherwise fails completely silently: search keeps
# "working" via SearXNG and only the quality collapses, which is a horrible way to find
# out. Last outcome only — this is a status light, not a log.
_search_status: dict[str, object] = {"ok": True, "detail": "", "at": 0.0}


def note_search(ok: bool, detail: str = "") -> None:
    import time

    _search_status.update({"ok": ok, "detail": detail[:200], "at": time.time()})


def search_status() -> dict[str, object]:
    return dict(_search_status)


def set_search(values: dict[str, str | None]) -> None:
    """Merge-update the web-search settings. Empty values are ignored so saving
    never wipes a stored key by accident."""
    from sqlmodel import Session

    from app.db import engine
    from app.models import AppSetting

    merged = {**_search}
    for k in ("brave_api_key",):
        v = str(values.get(k) or "").strip()
        if v:
            merged[k] = v
    with Session(engine) as session:
        row = session.get(AppSetting, "search") or AppSetting(key="search", value={})
        row.value = merged
        session.add(row)
        session.commit()
    _search.clear()
    _search.update(merged)


def model_for(role: str) -> str:
    """The effective model for a role. Only the main model is mandatory; the helper
    roles are specializations — unset means "same as main" at whichever layer:

    chat pin > chat's pinned main > admin setting > config.toml > the main model
    """
    turn = turn_overrides.get()
    v = turn.get(role, "")
    if v:
        return v
    # A chat that pins its main model takes over the unset helper roles too — the
    # test bench isolates the whole chat, not just the final answer. (stream_chat
    # pre-resolves vision for blind mains before setting the contextvar.)
    if role in FOLLOW_MAIN and turn.get("orchestrator"):
        return turn["orchestrator"]
    base = _overrides[role] if role in _overrides else getattr(get_settings().models, role)
    if not base and role in FOLLOW_MAIN:
        return _overrides.get("orchestrator") or get_settings().models.orchestrator
    return base


def current() -> dict[str, str]:
    """Resolved view: the model each role actually runs on right now (globals only)."""
    return {role: model_for(role) for role in ROLES}


def settings_view() -> dict[str, str]:
    """Raw view for the admin page: "" on a helper role means "same as main" —
    distinct from the resolved name, so the select can show the choice itself."""
    return {role: _overrides[role] if role in _overrides else getattr(get_settings().models, role) for role in ROLES}


def set_overrides(models: dict[str, str]) -> dict[str, str]:
    from sqlmodel import Session

    from app.db import engine
    from app.models import AppSetting

    clean = {k: v for k, v in models.items() if k in ROLES and (v or k in FOLLOW_MAIN)}
    with Session(engine) as session:
        row = session.get(AppSetting, "models") or AppSetting(key="models", value={})
        row.value = clean
        session.add(row)
        session.commit()
    _overrides.clear()
    _overrides.update(clean)
    return settings_view()
