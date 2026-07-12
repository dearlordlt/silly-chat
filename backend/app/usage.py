"""Usage accounting — counts only, never content.

Every LLM run and image generation records one UsageEvent row (user, model, token /
image counts). The admin Statistics panel aggregates these. Nothing about WHAT was
asked or answered is stored — that is the privacy line.
"""

from __future__ import annotations

from datetime import datetime

from app.logging_setup import get_logger

log = get_logger("usage")


def record_llm(model: str, usage: object, user_id: int | None = None) -> None:
    """Record one model run's token usage. user_id defaults to the requesting user
    (the turn's contextvar); no-ops outside a user context. Never raises — accounting
    must not be able to break a chat turn."""
    try:
        if user_id is None:
            from app.agent.activity import user_var

            user_id = user_var.get()
        if user_id is None or usage is None:
            return
        _insert(
            user_id,
            "llm",
            model,
            int(getattr(usage, "input_tokens", 0) or 0),
            int(getattr(usage, "output_tokens", 0) or 0),
            0,
        )
    except Exception as exc:
        log.warning("usage record failed: %s", exc)


def record_image(model: str, n: int = 1, user_id: int | None = None) -> None:
    """Record n generated images. Same contract as record_llm."""
    try:
        if user_id is None:
            from app.agent.activity import user_var

            user_id = user_var.get()
        if user_id is None:
            return
        _insert(user_id, "image", model, 0, 0, n)
    except Exception as exc:
        log.warning("usage record failed: %s", exc)


def _insert(user_id: int, kind: str, model: str, tin: int, tout: int, images: int) -> None:
    from sqlmodel import Session

    from app.db import engine
    from app.models import UsageEvent

    with Session(engine) as session:
        session.add(
            UsageEvent(
                user_id=user_id, kind=kind, model=model,
                input_tokens=tin, output_tokens=tout, images=images,
            )
        )
        session.commit()


def stats(session, since: datetime | None) -> list[dict]:
    """Aggregate usage per user, broken down per model+kind, newest-heaviest first."""
    from sqlmodel import func, select

    from app.models import UsageEvent, User

    q = select(
        UsageEvent.user_id,
        UsageEvent.kind,
        UsageEvent.model,
        func.sum(UsageEvent.input_tokens),
        func.sum(UsageEvent.output_tokens),
        func.sum(UsageEvent.images),
        func.count(),
    ).group_by(UsageEvent.user_id, UsageEvent.kind, UsageEvent.model)
    if since is not None:
        q = q.where(UsageEvent.created_at >= since)
    rows = session.exec(q).all()
    names = {u.id: u.username for u in session.exec(select(User)).all()}
    users: dict[int, dict] = {}
    for uid, kind, model, tin, tout, imgs, reqs in rows:
        u = users.setdefault(
            uid,
            {
                "id": uid,
                "username": names.get(uid, "(deleted user)"),
                "input_tokens": 0,
                "output_tokens": 0,
                "images": 0,
                "models": [],
            },
        )
        u["input_tokens"] += int(tin or 0)
        u["output_tokens"] += int(tout or 0)
        u["images"] += int(imgs or 0)
        u["models"].append(
            {
                "model": model,
                "kind": kind,
                "input_tokens": int(tin or 0),
                "output_tokens": int(tout or 0),
                "images": int(imgs or 0),
                "requests": int(reqs or 0),
            }
        )
    out = sorted(users.values(), key=lambda u: -(u["input_tokens"] + u["output_tokens"]))
    for u in out:
        u["models"].sort(key=lambda m: -(m["input_tokens"] + m["output_tokens"] + m["images"]))
    return out
