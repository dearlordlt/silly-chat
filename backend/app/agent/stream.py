"""Run the orchestrator and emit the typed stream-event protocol.

Streams: a top-level heartbeat, live per-worker activity (agent_update, pushed by the
tools via the activity contextvars), then the final blocks. Sources collected by the
workers are deduped and appended as a Sources block so every grounded answer ships
its proof.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from pydantic_ai import RunContext
from pydantic_ai.messages import (
    FunctionToolCallEvent,
    ModelRequest,
    ModelResponse,
    TextPart,
    UserPromptPart,
)

from app.agent.activity import emit_var, sources_var
from app.agent.orchestrator import Mode, build_orchestrator
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

_DONE = object()
_TOOL_STATUS = {"research": "Planning the research…", "find_images": "Looking for images…"}
_MAX_HISTORY = 20  # messages of prior context fed to the model


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

    async def run() -> None:
        tok_e = emit_var.set(emit)
        tok_s = sources_var.set(sources)
        try:
            result = await agent.run(
                message, message_history=message_history, event_stream_handler=on_events
            )
            queue.put_nowait(("result", result.output))
        except Exception as exc:
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
