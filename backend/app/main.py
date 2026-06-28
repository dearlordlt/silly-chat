"""FastAPI app — thin transport over the agent. No prompts or config inline here."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from app.agent.stream import stream_chat
from app.prompts.registry import validate_prompts


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail fast at boot if any referenced prompt file is missing.
    validate_prompts()
    yield


app = FastAPI(title="silly-chat", lifespan=lifespan)

# Dev frontend (Vite). Tighten/parameterize for prod in Phase 4.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str
    mode: Literal["search", "chat"] = "search"


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/api/chat")
async def chat(req: ChatRequest) -> EventSourceResponse:
    async def event_generator():
        async for event in stream_chat(req.message, req.mode):
            yield {"event": event.event, "data": event.model_dump_json()}

    return EventSourceResponse(event_generator())
