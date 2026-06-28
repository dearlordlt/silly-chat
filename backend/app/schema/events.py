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


class DoneEvent(BaseModel):
    event: Literal["done"] = "done"


class ErrorEvent(BaseModel):
    event: Literal["error"] = "error"
    message: str


StreamEvent = Annotated[
    Union[
        TextDeltaEvent,
        BlockStartEvent,
        BlockDataEvent,
        AgentStatusEvent,
        DoneEvent,
        ErrorEvent,
    ],
    Field(discriminator="event"),
]
