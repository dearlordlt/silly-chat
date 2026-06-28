"""FastAPI app — thin transport over the agent. No prompts or config inline here."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from app import ratelimit
from app.agent.stream import stream_chat
from app.auth.deps import ApprovedUser
from app.auth.routes import admin_router, auth_router
from app.config import get_settings
from app.conversations import router as conversations_router
from app.db import init_db
from app.prompts.registry import validate_prompts


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail fast at boot if any referenced prompt file is missing.
    validate_prompts()
    init_db()
    from app import runtime

    runtime.load_overrides()
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


class HistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str
    mode: Literal["search", "chat"] = "search"
    history: list[HistoryMessage] = []


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/api/chat")
async def chat(req: ChatRequest, user: ApprovedUser) -> EventSourceResponse:
    if not ratelimit.allow(f"user:{user.id}", get_settings().limits.user_requests_per_minute):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "slow down a moment")

    history = [(m.role, m.content) for m in req.history]

    async def event_generator():
        async for event in stream_chat(req.message, req.mode, history):
            yield {"event": event.event, "data": event.model_dump_json()}

    return EventSourceResponse(event_generator())
