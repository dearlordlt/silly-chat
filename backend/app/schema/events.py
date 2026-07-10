"""Streaming event protocol — the typed events multiplexed over SSE.

Hard rule: a block's TYPE arrives before its DATA. ``block_start`` (carrying the
type) lets the frontend render a type-specific skeleton immediately; ``block_data``
fills it. This is what enables progressive rendering instead of a spinner-then-pop.

The frontend is a small state machine dispatching on ``event``.
"""

from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field

from app.schema.blocks import Block


class TextDeltaEvent(BaseModel):
    event: Literal["text_delta"] = "text_delta"
    block_id: str
    text: str


class BlockStartEvent(BaseModel):
    """Opens a block. Carries the type (and id) BEFORE any data — enables skeleton."""

    event: Literal["block_start"] = "block_start"
    block_id: str
    block_type: str


class BlockDataEvent(BaseModel):
    """Fills a previously-started block with its validated payload."""

    event: Literal["block_data"] = "block_data"
    block_id: str
    block: Block


class AgentStatusEvent(BaseModel):
    """Working heartbeat to fill dead air during multi-round-trip runs."""

    event: Literal["agent_status"] = "agent_status"
    message: str


class AgentUpdateEvent(BaseModel):
    """Lifecycle of an individual sub-agent — drives the live activity panel.

    The frontend merges by ``id``: ``label`` is set when the agent starts; later
    updates carry ``status``/``state`` only.
    """

    event: Literal["agent_update"] = "agent_update"
    id: str
    label: str = ""
    status: str = ""
    state: Literal["running", "done", "error"] = "running"


class DoneEvent(BaseModel):
    event: Literal["done"] = "done"
    # Turn telemetry for the status line (None/empty when unknown, e.g. on errors).
    input_tokens: int | None = None  # context consumed by the final model request
    output_tokens: int | None = None  # tokens generated across the whole turn
    context_window: int | None = None  # configured model context size
    models: list[str] = Field(default_factory=list)  # models that worked this turn


class ErrorEvent(BaseModel):
    event: Literal["error"] = "error"
    message: str


StreamEvent = Annotated[
    Union[
        TextDeltaEvent,
        BlockStartEvent,
        BlockDataEvent,
        AgentStatusEvent,
        AgentUpdateEvent,
        DoneEvent,
        ErrorEvent,
    ],
    Field(discriminator="event"),
]
