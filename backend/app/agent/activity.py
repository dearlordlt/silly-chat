"""Run-scoped channels for transparency + citations.

A single chat turn sets these contextvars; tools and nested worker agents read them
to (a) stream their live status to the UI and (b) record the sources they used.
contextvars propagate into the tasks spawned by asyncio.gather, so per-worker state
stays isolated.
"""

from __future__ import annotations

from collections.abc import Callable
from contextvars import ContextVar

from app.schema import AgentUpdateEvent, Source

# Pushes a stream event onto the SSE queue (set by stream_chat).
emit_var: ContextVar[Callable[[object], None] | None] = ContextVar("emit", default=None)
# The id of the worker agent currently executing (for attributing sub-status).
agent_var: ContextVar[str | None] = ContextVar("agent", default=None)
# Accumulates sources used during the turn (deduped + rendered at the end).
sources_var: ContextVar[list[Source] | None] = ContextVar("sources", default=None)
# Accumulates research findings as (subtask, summary) — reused by the text fallback.
findings_var: ContextVar[list[tuple[str, str]] | None] = ContextVar("findings", default=None)


def agent_update(id: str, *, label: str = "", status: str = "", state: str = "running") -> None:
    emit = emit_var.get()
    if emit is not None:
        emit(AgentUpdateEvent(id=id, label=label, status=status, state=state))


def status_for_current_agent(status: str) -> None:
    aid = agent_var.get()
    if aid is not None:
        agent_update(aid, status=status)


def record_sources(items: list[Source]) -> None:
    bucket = sources_var.get()
    if bucket is not None:
        bucket.extend(items)


def record_findings(items: list[tuple[str, str]]) -> None:
    bucket = findings_var.get()
    if bucket is not None:
        bucket.extend(items)
