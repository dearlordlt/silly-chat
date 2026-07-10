"""Run the orchestrator and emit the typed stream-event protocol.

Streams: a top-level heartbeat, live per-worker activity (agent_update, pushed by the
tools via the activity contextvars), then the final blocks. Sources collected by the
workers are deduped and appended as a Sources block so every grounded answer ships
its proof.
"""

from __future__ import annotations

import asyncio
import re
from collections.abc import AsyncIterator

from pydantic_ai import RunContext, capture_run_messages
from pydantic_ai.messages import (
    FinalResultEvent,
    FunctionToolCallEvent,
    FunctionToolResultEvent,
    ModelRequest,
    ModelResponse,
    PartDeltaEvent,
    PartStartEvent,
    TextPart,
    TextPartDelta,
    ToolCallPart,
    UserPromptPart,
)
from pydantic_core import from_json

from pydantic_ai import Agent

from app.agent.activity import (
    artifacts_var,
    attachments_var,
    code_tasks_var,
    code_var,
    docs_var,
    edits_var,
    emit_var,
    findings_var,
    looks_var,
    maps_var,
    sources_var,
)
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
    TextDeltaEvent,
)

log = get_logger("chat")

_DONE = object()
_TOOL_STATUS = {
    "research": "Planning the research…",
    "find_images": "Looking for images…",
    "show_map": "Drawing the map…",
}

# Shown the moment the model STARTS writing a tool call (its arguments can take a
# long time to generate — e.g. a detailed coding brief). Without this, the UI sits
# on a bare "Thinking…" for the whole stretch.
_TOOL_PREP = {
    "write_code": "Writing the build brief…",
    "research": "Planning the research…",
    "find_images": "Planning the image hunt…",
    "show_map": "Choosing places for the map…",
    "search_document": "Checking your document…",
    "look": "Opening your image…",
}
_MIN_HISTORY = 4  # newest messages always kept, whatever their size


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


_MAX_CONTEXT_CHARS = 100_000  # backstop on artifact + @-linked context riding in from the client
_FALLBACK_WINDOW = 131_072  # assumed window when the endpoint doesn't report one


async def _history_budget_chars() -> int:
    """History backstop in characters: the compaction threshold share of the model's
    window (the client compacts at the same threshold — this only catches clients
    that didn't). ~4 chars/token heuristic."""
    from app import runtime
    from app.agent.ollama import context_window

    window = await context_window(runtime.model_for("orchestrator")) or _FALLBACK_WINDOW
    return int(window * (runtime.compact_pct() / 100) * 4)


def _build_history(
    history: list[tuple[str, str]],
    context: str | None = None,
    summary: str | None = None,
    budget_chars: int = _FALLBACK_WINDOW * 3,
):
    messages = []
    # Background blocks sit BEFORE the recent-history window, each paired with an
    # ack so the transcript keeps user/assistant alternation.
    if summary and summary.strip():
        messages.append(ModelRequest(parts=[UserPromptPart(
            content="[Summary of this conversation's earlier messages — treat as things "
            f"you both said and remember.]\n\n{summary[:_MAX_CONTEXT_CHARS]}"
        )]))
        messages.append(ModelResponse(parts=[TextPart(content="Got it — I remember all of that.")]))
    if context and context.strip():
        messages.append(ModelRequest(parts=[UserPromptPart(content=context[:_MAX_CONTEXT_CHARS])]))
        messages.append(ModelResponse(parts=[TextPart(content="Noted — I'll use that as background context.")]))
    # Newest messages first until the budget runs out (oldest get dropped), then
    # restore chronological order. The newest _MIN_HISTORY always make it.
    kept: list[tuple[str, str]] = []
    used = 0
    for i, (role, content) in enumerate(reversed(history)):
        if not content.strip():
            continue
        if i >= _MIN_HISTORY and used + len(content) > budget_chars:
            break
        used += len(content)
        kept.append((role, content))
    for role, content in reversed(kept):
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
    context: str | None = None,
    summary: str | None = None,
    artifacts: dict[str, tuple[str, str, str]] | None = None,  # id -> (name, language, content)
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
    # Current code artifacts ride in once (latest version only) so the orchestrator
    # can discuss the code — history carries placeholders instead of every version.
    artifact_context = None
    if artifacts:
        chunks = []
        used = 0
        for art_id, (name, lang, content) in artifacts.items():
            body = content[: max(0, 60_000 - used)]
            used += len(body)
            chunks.append(f"### Artifact {art_id} — {name or 'snippet'} ({lang}):\n```{lang}\n{body}\n```")
        artifact_context = (
            "[Current code artifacts in this chat — each is the LATEST version; to change "
            "one, call write_code with its artifact_id (never paste this code yourself).]\n\n"
            + "\n\n".join(chunks)
        )

    agent = build_orchestrator(effective_mode, timezone)
    message_history = _build_history(
        history or [],
        "\n\n".join(x for x in (artifact_context, context) if x) or None,
        summary,
        await _history_budget_chars(),
    )
    queue: asyncio.Queue = asyncio.Queue()
    sources: list[Source] = []
    findings: list[tuple[str, str]] = []
    code: list[tuple[str, str, str | None, str]] = []  # (language, content, filename, artifact_id)
    built_maps: list = []
    edits: list = []  # EditsBlocks from targeted artifact edits
    stats: dict[str, int] = {}  # turn telemetry for the status line

    def emit(ev: object) -> None:
        queue.put_nowait(ev)

    # Live answer streaming: the model writes its Reply as JSON *text* (see
    # orchestrator.py — text is the only channel Ollama streams). We accumulate the
    # final text part, partial-parse it, and forward the text blocks' markdown as
    # text_delta events so the answer appears as it is written. Ids are positional
    # (b0, b1, …) — the same scheme _final_events uses, so the final validated
    # block_data lands in the slot that streamed.
    out_state = {"index": None, "buf": "", "started": set(), "sent": {}}

    def _stream_partial() -> None:
        raw = out_state["buf"].lstrip()
        if raw.startswith("```"):  # some models fence their JSON
            nl = raw.find("\n")
            if nl == -1:
                return  # fence line still streaming
            raw = raw[nl + 1 :]
        raw = raw.rstrip().rstrip("`")
        try:
            parsed = from_json(raw, allow_partial="trailing-strings")
        except ValueError:
            return
        blocks = parsed.get("blocks") if isinstance(parsed, dict) else None
        if not isinstance(blocks, list):
            return
        for i, blk in enumerate(blocks):
            if not isinstance(blk, dict):
                continue
            # A block's "type" string is only certainly complete once another key
            # follows it (or a later block exists) — don't skeleton a half-word.
            if i not in out_state["started"] and (i < len(blocks) - 1 or len(blk) >= 2):
                bt = blk.get("type")
                if isinstance(bt, str) and bt:
                    out_state["started"].add(i)
                    emit(BlockStartEvent(block_id=f"b{i}", block_type=bt))
            if blk.get("type") == "text" and isinstance(blk.get("markdown"), str):
                done = out_state["sent"].get(i, 0)
                fresh = blk["markdown"][done:]
                if fresh and i in out_state["started"]:
                    out_state["sent"][i] = done + len(fresh)
                    emit(TextDeltaEvent(block_id=f"b{i}", text=fresh))

    # Text parts of the CURRENT model response, by part index. FinalResultEvent
    # marks the response that carries the Reply — from then on, deltas stream out.
    text_bufs: dict[int, str] = {}

    async def on_events(ctx: RunContext, event_stream) -> None:
        async for event in event_stream:
            if isinstance(event, PartStartEvent) and isinstance(event.part, ToolCallPart):
                msg = _TOOL_PREP.get(event.part.tool_name or "")
                if msg:
                    emit(AgentStatusEvent(message=msg))
            elif isinstance(event, PartStartEvent) and isinstance(event.part, TextPart):
                text_bufs[event.index] = event.part.content or ""
            elif isinstance(event, PartDeltaEvent) and isinstance(event.delta, TextPartDelta):
                text_bufs[event.index] = text_bufs.get(event.index, "") + (event.delta.content_delta or "")
                if event.index == out_state["index"]:
                    out_state["buf"] = text_bufs[event.index]
                    _stream_partial()
            elif isinstance(event, FinalResultEvent) and event.tool_name is None:
                # The text part that just started IS the Reply — stream it.
                if text_bufs:
                    out_state["index"] = max(text_bufs)
                    out_state["buf"] = text_bufs[out_state["index"]]
                    _stream_partial()
            elif isinstance(event, FunctionToolCallEvent):
                msg = _TOOL_STATUS.get(event.part.tool_name)
                if msg:
                    emit(AgentStatusEvent(message=msg))
            elif isinstance(event, FunctionToolResultEvent):
                # Tool finished; the model is now composing the answer. A new model
                # response follows — its part indexes restart, so drop the old ones.
                text_bufs.clear()
                out_state["index"] = None
                emit(AgentStatusEvent(message="Writing the answer…"))

    async def run() -> None:
        tok_e = emit_var.set(emit)
        tok_s = sources_var.set(sources)
        tok_f = findings_var.set(findings)
        tok_c = code_var.set(code)
        tok_ct = code_tasks_var.set({})
        tok_lk = looks_var.set([])
        tok_art = artifacts_var.set(artifacts or {})
        tok_m = maps_var.set(built_maps)
        tok_ed = edits_var.set(edits)
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
                    # Context used = prompt tokens of the LAST model request (the full
                    # conversation as the model saw it); output = whole-turn total.
                    for m in reversed(result.all_messages()):
                        if isinstance(m, ModelResponse) and m.usage and m.usage.input_tokens:
                            stats["input_tokens"] = m.usage.input_tokens
                            break
                    usage = result.usage() if callable(result.usage) else result.usage
                    if usage and usage.output_tokens:
                        stats["output_tokens"] = usage.output_tokens
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
            code_tasks_var.reset(tok_ct)
            looks_var.reset(tok_lk)
            artifacts_var.reset(tok_art)
            maps_var.reset(tok_m)
            edits_var.reset(tok_ed)
            tz_var.reset(tok_tz)
            attachments_var.reset(tok_a)
            docs_var.reset(tok_d)
            queue.put_nowait(_DONE)

    task = asyncio.create_task(run())
    try:
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
                    for ev in _final_events(payload, code, built_maps, sources, edits, artifacts):
                        yield ev
            else:
                yield item  # AgentStatusEvent / AgentUpdateEvent / block streaming

        from app import runtime
        from app.agent.ollama import context_window

        models = [runtime.model_for("orchestrator")]
        if findings:
            models.append(runtime.model_for("worker"))
        if attachments:
            models.append(runtime.model_for("vision"))
        if code:
            models.append(runtime.model_for("coder"))
        yield DoneEvent(
            input_tokens=stats.get("input_tokens"),
            output_tokens=stats.get("output_tokens"),
            # From Ollama's own model metadata (cached) — never hardcoded.
            context_window=await context_window(models[0]),
            models=list(dict.fromkeys(models)),
        )
    finally:
        # Client gone (stop button / closed tab) or normal end: make sure the agent
        # task dies with the stream so an abandoned turn stops burning tokens.
        if not task.done():
            log.info("turn cancelled by client")
            task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):  # noqa: BLE001 — run() logs its own errors
            pass


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


_LEAKED_TAGS = re.compile(r"</?\s*(?:content|write_code|final_result)\s*>", re.IGNORECASE)
_EMPTY_FENCE = re.compile(r"```[\w-]*\s*\n\s*```")


def _scrub_code_leaks(blocks: list, artifact_contents: list[str]) -> list:
    """Models sometimes regurgitate artifact code (and tool-tag debris) into their
    prose — seen live as hundreds of code lines spilling through a text block. The
    code already has its own canvas: surgically drop prose lines that are verbatim
    artifact lines, plus leaked pseudo-tags and fences left empty by the surgery."""
    code_lines: set[str] = set()
    for content in artifact_contents:
        for line in content.split("\n"):
            s = line.strip()
            if len(s) >= 18:
                code_lines.add(s)
    out = []
    for b in blocks:
        if getattr(b, "type", None) == "text":
            md = _LEAKED_TAGS.sub("", b.markdown)
            if code_lines:
                md = "\n".join(l for l in md.split("\n") if l.strip() not in code_lines)
            md = _EMPTY_FENCE.sub("", md)
            md = "\n".join(l.rstrip() for l in md.split("\n"))
            md = re.sub(r"\n{3,}", "\n\n", md).strip()
            if not md:
                continue  # the whole block was leaked code
            b.markdown = md
        out.append(b)
    return out


def _final_events(
    reply,
    code: list[tuple[str, str, str | None, str]],
    built_maps: list,
    sources: list[Source],
    edits: list | None = None,
    artifacts: dict[str, tuple[str, str, str]] | None = None,
):
    blocks = list(reply.blocks)
    contents = [v[2] for v in (artifacts or {}).values()] + [c for _, c, _, _ in code]
    if contents:
        blocks = _scrub_code_leaks(blocks, contents)
    # Targeted-edit records (what changed) come before the updated code (the result).
    blocks.extend(edits or [])
    # Code the coder wrote this turn, deduped by artifact id (last version wins).
    latest: dict[str, tuple[str, str, str | None]] = {}
    for language, content, filename, artifact_id in code:
        latest[artifact_id] = (language, content, filename)
    # The coder's output is authoritative. Models "reference" artifacts by emitting
    # their own code block with the artifact_id and empty/abbreviated content (seen
    # live — it clobbered the stored artifact with ""). Swap in the real content;
    # strip artifact ids we didn't record so nothing can corrupt stored artifacts.
    shown: set[str] = set()
    for b in blocks:
        if getattr(b, "type", None) == "code" and b.artifact_id:
            if b.artifact_id in latest:
                language, content, filename = latest[b.artifact_id]
                b.language, b.content, b.filename = language, content, filename
                shown.add(b.artifact_id)
            else:
                b.artifact_id = None
    # Anything the coder wrote that the model didn't surface gets appended verbatim
    # — unless the model pasted its own (id-less) code block instead.
    has_plain_code = any(getattr(b, "type", None) == "code" and not b.artifact_id for b in blocks)
    if not has_plain_code:
        for artifact_id, (language, content, filename) in latest.items():
            if artifact_id not in shown:
                blocks.append(
                    CodeBlock(language=language, content=content, filename=filename, artifact_id=artifact_id)
                )
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
