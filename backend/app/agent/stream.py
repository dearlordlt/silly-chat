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

from pydantic_ai import Agent

from app.agent.activity import attachments_var, code_var, docs_var, emit_var, findings_var, maps_var, sources_var
from app.agent.clock import tz_var
from app.agent.ollama import orchestrator_model
from app.agent.orchestrator import Mode, build_orchestrator
from app.logging_setup import get_logger
from app.schema import CodeBlock, Reply, TextBlock
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
_TOOL_STATUS = {
    "research": "Planning the research…",
    "find_images": "Looking for images…",
    "show_map": "Drawing the map…",
}
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
    timezone: str | None = None,
    attachments: list[tuple[str, bytes]] | None = None,
    doc_chunks: list[tuple[str, bytes]] | None = None,
) -> AsyncIterator[StreamEvent]:
    attachments = attachments or []
    doc_chunks = doc_chunks or []
    has_img, has_doc = bool(attachments), bool(doc_chunks)
    # The orchestrator's own model can't see images and shouldn't answer about a document
    # from memory — nudge it to the right tools.
    prompt = message
    effective_mode: Mode = mode
    if has_img or has_doc:
        hints = []
        if has_img:
            hints.append(f"use the look tool to see the {len(attachments)} image(s)")
        if has_doc:
            hints.append("use the search_document tool to find relevant passages in the attached document(s)")
        hint = "; ".join(hints)
        if message.strip():
            prompt = f"[The user attached file(s); their message below most likely refers to them — {hint} first.]\n\n{message}"
        else:
            # No text: the attachment IS the request. Neutral mode so a code/search pill bias
            # + prior-task history can't make it "continue" instead of addressing the file.
            effective_mode = "chat"
            ask = (
                "describe what it shows"
                if has_img and not has_doc
                else "summarize it" if has_doc and not has_img
                else "describe the image(s) and summarize the document(s)"
            )
            prompt = (
                f"[The user attached file(s) and no text — they ARE the whole request. {hint}, "
                f"then {ask}. Ignore the previous conversation; do NOT continue or repeat an "
                f"earlier task unless the attachment itself asks for it.]"
            )
    agent = build_orchestrator(effective_mode, timezone)
    message_history = _build_history(history or [])
    queue: asyncio.Queue = asyncio.Queue()
    sources: list[Source] = []
    findings: list[tuple[str, str]] = []
    code: list[tuple[str, str, str | None]] = []
    built_maps: list = []

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
        tok_f = findings_var.set(findings)
        tok_c = code_var.set(code)
        tok_m = maps_var.set(built_maps)
        tok_tz = tz_var.set(timezone)
        tok_a = attachments_var.set(attachments)
        tok_d = docs_var.set(doc_chunks)
        log.info("turn start: mode=%s history=%d msg=%r", mode, len(history or []), message[:120])
        try:
            with capture_run_messages() as messages:
                try:
                    result = await agent.run(
                        prompt, message_history=message_history, event_stream_handler=on_events
                    )
                    output = result.output
                except Exception as primary:
                    # Surface what the model produced, then salvage the research into a
                    # plain-text answer instead of failing the whole turn.
                    log.error("model trace: %s", _describe(messages))
                    log.warning("structured output failed (%s) — using text fallback", primary)
                    emit(AgentStatusEvent(message="Writing the answer…"))
                    output = await _text_fallback(message, findings, message_history)
            log.info("turn ok: %d block(s), %d source(s)", len(output.blocks), len(sources))
            queue.put_nowait(("result", output))
        except Exception as exc:
            log.exception("turn failed: %s", exc)
            queue.put_nowait(("error", str(exc)))
        finally:
            emit_var.reset(tok_e)
            sources_var.reset(tok_s)
            findings_var.reset(tok_f)
            code_var.reset(tok_c)
            maps_var.reset(tok_m)
            tz_var.reset(tok_tz)
            attachments_var.reset(tok_a)
            docs_var.reset(tok_d)
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
                for ev in _final_events(payload, code, built_maps, sources):
                    yield ev
        else:
            yield item  # AgentStatusEvent / AgentUpdateEvent

    yield DoneEvent()
    await task


async def _text_fallback(message: str, findings: list[tuple[str, str]], history) -> Reply:
    """Salvage a plain-text answer when structured output fails — reuse the research."""
    if findings:
        ctx = "\n\n".join(f"### {sub}\n{summ}" for sub, summ in findings)
        prompt = (
            "Answer the user's message clearly and directly using the research below.\n\n"
            f"User: {message}\n\nResearch:\n{ctx}"
        )
    else:
        prompt = message
    result = await Agent(orchestrator_model()).run(prompt, message_history=history)
    return Reply(blocks=[TextBlock(markdown=str(result.output))])


def _final_events(reply, code: list[tuple[str, str, str | None]], built_maps: list, sources: list[Source]):
    blocks = list(reply.blocks)
    # Append code written by the coder agent (verbatim — never round-tripped through
    # the orchestrator's output), unless the model already emitted it as a code block.
    has_code_block = any(getattr(b, "type", None) == "code" for b in blocks)
    if not has_code_block:
        for language, content, filename in code:
            blocks.append(CodeBlock(language=language, content=content, filename=filename))
    # Maps built by show_map carry real geocoded coordinates — always appended verbatim.
    # (The Reply schema excludes map blocks, so the model cannot emit its own.)
    blocks.extend(built_maps)
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
