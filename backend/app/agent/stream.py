"""Run the orchestrator and emit the typed stream-event protocol.

Streams: a top-level heartbeat, live per-worker activity (agent_update, pushed by the
tools via the activity contextvars), then the final blocks. Sources collected by the
workers are deduped and appended as a Sources block so every grounded answer ships
its proof.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from pydantic_ai import RunContext, capture_run_messages
from pydantic_ai.messages import (
    FunctionToolCallEvent,
    FunctionToolResultEvent,
    ModelRequest,
    ModelResponse,
    TextPart,
    UserPromptPart,
)

from app.agent.activity import emit_var, sources_var
from app.agent.orchestrator import Mode, build_orchestrator
from app.logging_setup import get_logger
from app.schema import (
    AgentStatusEvent,
    BlockDataEvent,
    BlockStartEvent,
    DoneEvent,
    ErrorEvent,
    Source,
    SourcesBlock,
    StreamEvent,
)

log = get_logger("chat")

_DONE = object()
_TOOL_STATUS = {"research": "Planning the research…", "find_images": "Looking for images…"}
_MAX_HISTORY = 20  # messages of prior context fed to the model


def _describe(messages) -> str:
    """Compactly render the last few model messages for diagnostics."""
    out = []
    for m in messages[-3:]:
        parts = []
        for p in getattr(m, "parts", []):
            name = type(p).__name__
            detail = getattr(p, "content", None)
            if detail is None:
                detail = getattr(p, "args", None) or getattr(p, "tool_name", "")
            parts.append(f"{name}({str(detail)[:160]!r})")
        out.append(f"{type(m).__name__}: {', '.join(parts)}")
    return " || ".join(out)


def _build_history(history: list[tuple[str, str]]):
    messages = []
    for role, content in history[-_MAX_HISTORY:]:
        if not content.strip():
            continue
        if role == "user":
            messages.append(ModelRequest(parts=[UserPromptPart(content=content)]))
        else:
            messages.append(ModelResponse(parts=[TextPart(content=content)]))
    return messages or None


async def stream_chat(
    message: str,
    mode: Mode = "search",
    history: list[tuple[str, str]] | None = None,
) -> AsyncIterator[StreamEvent]:
    agent = build_orchestrator(mode)
    message_history = _build_history(history or [])
    queue: asyncio.Queue = asyncio.Queue()
    sources: list[Source] = []

    def emit(ev: object) -> None:
        queue.put_nowait(ev)

    async def on_events(ctx: RunContext, event_stream) -> None:
        async for event in event_stream:
            if isinstance(event, FunctionToolCallEvent):
                msg = _TOOL_STATUS.get(event.part.tool_name)
                if msg:
                    emit(AgentStatusEvent(message=msg))
            elif isinstance(event, FunctionToolResultEvent):
                # Tool finished; the model is now composing the answer.
                emit(AgentStatusEvent(message="Writing the answer…"))

    async def run() -> None:
        tok_e = emit_var.set(emit)
        tok_s = sources_var.set(sources)
        log.info("turn start: mode=%s history=%d msg=%r", mode, len(history or []), message[:120])
        try:
            with capture_run_messages() as messages:
                try:
                    result = await agent.run(
                        message, message_history=message_history, event_stream_handler=on_events
                    )
                except Exception:
                    # Surface what the model actually produced — the key to diagnosing
                    # failures like "exceeded max output retries".
                    log.error("model trace: %s", _describe(messages))
                    raise
            n = len(result.output.blocks)
            log.info("turn ok: %d block(s), %d source(s)", n, len(sources))
            queue.put_nowait(("result", result.output))
        except Exception as exc:
            log.exception("turn failed: %s", exc)
            queue.put_nowait(("error", str(exc)))
        finally:
            emit_var.reset(tok_e)
            sources_var.reset(tok_s)
            queue.put_nowait(_DONE)

    task = asyncio.create_task(run())
    yield AgentStatusEvent(message="Thinking…")

    while True:
        item = await queue.get()
        if item is _DONE:
            break
        if isinstance(item, tuple):
            kind, payload = item
            if kind == "error":
                yield ErrorEvent(message=str(payload))
            else:
                for ev in _final_events(payload, sources):
                    yield ev
        else:
            yield item  # AgentStatusEvent / AgentUpdateEvent

    yield DoneEvent()
    await task


def _final_events(reply, sources: list[Source]):
    blocks = list(reply.blocks)
    seen: set[str] = set()
    unique: list[Source] = []
    for s in sources:
        if s.url and s.url not in seen:
            seen.add(s.url)
            unique.append(s)
    if unique:
        blocks.append(SourcesBlock(items=unique[:12]))
    for i, block in enumerate(blocks):
        bid = f"b{i}"
        yield BlockStartEvent(block_id=bid, block_type=block.type)
        yield BlockDataEvent(block_id=bid, block=block)
