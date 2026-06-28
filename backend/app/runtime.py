"""Runtime model overrides — admin-editable, layered over config.toml defaults.

config.toml provides the defaults (SSOT for first boot); admins can override the
orchestrator/worker/vision models at runtime via the admin API. Overrides persist
in the AppSetting table and are cached here for fast, sync access from the agent layer.
"""

from __future__ import annotations

from app.config import get_settings

ROLES = ("orchestrator", "worker", "vision")

_overrides: dict[str, str] = {}


def load_overrides() -> None:
    from sqlmodel import Session

    from app.db import engine
    from app.models import AppSetting

    with Session(engine) as session:
        row = session.get(AppSetting, "models")
    _overrides.clear()
    if row:
        _overrides.update({k: v for k, v in row.value.items() if k in ROLES and v})


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
