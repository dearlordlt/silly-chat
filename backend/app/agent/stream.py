"""Run the orchestrator and emit the typed stream-event protocol.

Streams a status heartbeat while tools fire (the agent runs "dark"), then emits the
final blocks as block_start (type) -> block_data (payload), honoring the
type-before-data rule so the frontend can show a type-specific skeleton.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from pydantic_ai import RunContext
from pydantic_ai.messages import FunctionToolCallEvent

from app.agent.orchestrator import Mode, build_orchestrator
from app.schema import (
    AgentStatusEvent,
    BlockDataEvent,
    BlockStartEvent,
    DoneEvent,
    ErrorEvent,
    StreamEvent,
)

# Heartbeat copy shown while a tool runs. (UI microcopy, not model behavior.)
_STATUS = {
    "web_search": "Searching the web…",
    "image_search": "Looking for images…",
    "vision_verify": "Checking the images…",
}
_DONE = object()


async def stream_chat(message: str, mode: Mode = "search") -> AsyncIterator[StreamEvent]:
    agent = build_orchestrator(mode)
    queue: asyncio.Queue = asyncio.Queue()

    async def on_events(ctx: RunContext, event_stream) -> None:
        async for event in event_stream:
            if isinstance(event, FunctionToolCallEvent):
                msg = _STATUS.get(event.part.tool_name, "Working…")
                await queue.put(AgentStatusEvent(message=msg))

    async def run() -> None:
        try:
            result = await agent.run(message, event_stream_handler=on_events)
            await queue.put(("result", result.output))
        except Exception as exc:  # surface as an error event, never crash the stream
            await queue.put(("error", str(exc)))
        finally:
            await queue.put(_DONE)

    task = asyncio.create_task(run())
    yield AgentStatusEvent(message="Thinking…")

    while True:
        item = await queue.get()
        if item is _DONE:
            break
        if isinstance(item, AgentStatusEvent):
            yield item
        elif item[0] == "result":
            for i, block in enumerate(item[1].blocks):
                bid = f"b{i}"
                yield BlockStartEvent(block_id=bid, block_type=block.type)
                yield BlockDataEvent(block_id=bid, block=block)
        elif item[0] == "error":
            yield ErrorEvent(message=item[1])

    yield DoneEvent()
    await task
