"""FastAPI app — thin transport over the agent. No prompts or config inline here."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from app import ratelimit
from app.agent.orchestrator import Mode
from app.agent.stream import stream_chat
from app.auth.deps import ApprovedUser, SessionDep
from app.auth.routes import admin_router, auth_router
from app.config import get_settings
from app.conversations import router as conversations_router
from app.preview import router as preview_router
from app.uploads import resolve_attachments, router as uploads_router
from app.meta import router as meta_router
from app.db import init_db
from app.prompts.registry import validate_prompts


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app import runtime
    from app.logging_setup import get_logger, setup_logging

    setup_logging(get_settings().logging.level)
    # Fail fast at boot if any referenced prompt file is missing.
    validate_prompts()
    init_db()
    runtime.load_overrides()
    from app.uploads import sweep_expired

    sweep_expired()  # drop attachments past their TTL on boot
    get_logger("app").info("silly-chat ready — models=%s", runtime.current())
    yield


app = FastAPI(title="silly-chat", lifespan=lifespan)

# Dev frontend (Vite). Same-origin in prod (nginx), so this only matters in dev.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(conversations_router)
app.include_router(preview_router)
app.include_router(uploads_router)
app.include_router(meta_router)


class HistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str
    mode: Mode = "search"
    history: list[HistoryMessage] = []
    timezone: str | None = None  # IANA tz, only if the user opted to share it
    attachments: list[str] = []  # upload ids to attach to this message (images)


@app.get("/api/health")
async def health() -> dict:
    """Liveness for uptime monitors: 200 only when the app AND its database work.

    Unauthenticated by design; exposes nothing beyond status + version.
    """
    from sqlalchemy import text
    from app.db import engine
    from app.meta import get_meta

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, f"db: {exc}")
    return {"status": "ok", "version": get_meta().version}


@app.post("/api/chat")
async def chat(req: ChatRequest, user: ApprovedUser, session: SessionDep) -> EventSourceResponse:
    if not ratelimit.allow(f"user:{user.id}", get_settings().limits.user_requests_per_minute):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "slow down a moment")

    history = [(m.role, m.content) for m in req.history]
    # Resolve attachment ids (owner-checked). Documents are chat-only — ignore them in
    # search/code modes so they don't divert those flows.
    images, doc_chunks = resolve_attachments(
        session, req.attachments, user.id, include_docs=req.mode == "chat"
    )

    async def event_generator():
        async for event in stream_chat(
            req.message, req.mode, history, req.timezone, images, doc_chunks
        ):
            yield {"event": event.event, "data": event.model_dump_json()}

    return EventSourceResponse(event_generator())
