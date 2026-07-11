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
# Code written this turn as (language, content, filename, artifact_id) — appended as
# code blocks. filename is None for an unnamed single snippet.
code_var: ContextVar[list[tuple[str, str, str | None, str]] | None] = ContextVar("code", default=None)
# The chat's current code artifacts as sent by the client: {id: (name, language, content)}.
# write_code reads these to seed edits with the existing code.
artifacts_var: ContextVar[dict[str, tuple[str, str, str]] | None] = ContextVar("artifacts", default=None)
# Image attachments on the current turn as (media_type, bytes) — read by the vision `look` tool.
attachments_var: ContextVar[list[tuple[str, bytes]] | None] = ContextVar("attachments", default=None)
# Document chunks attached this turn as (text, embedding_bytes) — read by `search_document`.
docs_var: ContextVar[list[tuple[str, bytes]] | None] = ContextVar("docs", default=None)
# Maps built this turn by the show_map tool — appended as map blocks.
maps_var: ContextVar[list[object] | None] = ContextVar("maps", default=None)
# Targeted-edit records (EditsBlock) this turn — shown before the updated code.
edits_var: ContextVar[list[object] | None] = ContextVar("edits", default=None)
# Generated files (FileBlock) this turn — e.g. PDFs from make_document.
files_var: ContextVar[list[object] | None] = ContextVar("files", default=None)
# The requesting user's id — generated files are stored under their ownership.
user_var: ContextVar[int | None] = ContextVar("user", default=None)
# The requester's data key — generated files are sealed with it.
dk_var: ContextVar[bytes | None] = ContextVar("dk", default=None)
# Coding tasks already dispatched this turn — write_code refuses exact duplicates
# (models sometimes emit the same tool call twice, in parallel or on output retry).
code_tasks_var: ContextVar[dict[str, str] | None] = ContextVar("code_tasks", default=None)
# look-tool invocations this turn — capped, since re-examining a pre-change
# screenshot to "verify" an edit is pure waste (seen live in a look/edit loop).
looks_var: ContextVar[list[str] | None] = ContextVar("looks", default=None)
# Documents generated this turn (by title) — make_document refuses duplicates
# (models hedge-call generation tools twice; seen live with write_code AND here).
doc_tasks_var: ContextVar[dict[str, str] | None] = ContextVar("doc_tasks", default=None)
# Generic exactly-once claims for generation tools (models hedge-call them — seen
# live with code, documents, AND maps). Key = tool name + normalized args.
dispatch_var: ContextVar[dict[str, str] | None] = ContextVar("dispatch", default=None)


def claim_dispatch(key: str) -> bool:
    """Claim a turn-scoped exactly-once slot. False = this exact call already ran."""
    d = dispatch_var.get()
    if d is None:
        return True
    if key in d:
        return False
    d[key] = "claimed"
    return True


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


def record_code(language: str, content: str, filename: str | None, artifact_id: str) -> None:
    bucket = code_var.get()
    if bucket is not None:
        bucket.append((language, content, filename, artifact_id))


def record_map(block: object) -> None:
    bucket = maps_var.get()
    if bucket is not None:
        bucket.append(block)


def record_edits(block: object) -> None:
    bucket = edits_var.get()
    if bucket is not None:
        bucket.append(block)


def record_file(block: object) -> None:
    bucket = files_var.get()
    if bucket is not None:
        bucket.append(block)
