"""Orchestrator tools.

The orchestrator delegates: it decides how to break a question into subtasks and
calls ``research`` with that list — one parallel worker agent per subtask. Each
worker searches the web, streams its status, and records the sources it used.
``find_images`` runs the search -> vision-verify image flow as its own agent.

Descriptions come from the prompt registry (SSOT); nothing inline.
"""

from __future__ import annotations

import asyncio
import re
import uuid
from contextvars import ContextVar

from pydantic import BaseModel
from pydantic_ai import Agent, BinaryContent, Tool
from pydantic_ai.exceptions import UsageLimitExceeded
from pydantic_ai.messages import PartDeltaEvent, PartStartEvent, TextPart, TextPartDelta
from pydantic_ai.usage import UsageLimits

from app import runtime
from app.agent import search
from app.agent.clock import now_str, tz_var
from app.agent.activity import (
    agent_update,
    agent_var,
    artifacts_var,
    attachments_var,
    claim_dispatch,
    code_tasks_var,
    dispatch_var,
    doc_tasks_var,
    docs_var,
    emit_var,
    image_quota_var,
    looks_var,
    record_code,
    record_edits,
    record_file,
    record_findings,
    record_found_images,
    record_gen_image,
    record_map,
    record_sources,
    status_for_current_agent,
    user_var,
)
from app.usage import record_llm
from app.agent import maps as osm
from app.embeddings import embed_texts, rank
from app.schema import (
    BlockStartEvent,
    EditChange,
    EditsBlock,
    ImageQuotaEvent,
    MapArea,
    MapBlock,
    TextDeltaEvent,
)
from app.agent.images import ImageFetchError, fetch_image_bytes, guess_media_type
from app.agent.ollama import coder_model, vision_model, worker_model
from app.config import get_settings
from app.logging_setup import get_logger
from app.prompts.registry import get_prompt
from app.schema import Source

log = get_logger("agent")


class Finding(BaseModel):
    subtask: str
    summary: str


class ImageHit(BaseModel):
    url: str
    title: str
    source_url: str


# ---- worker-side web search (streams status, records sources) ----

# Queries already run by the current worker (fresh set per run). Worker models
# sometimes re-issue the same search over and over instead of answering —
# seen live: 16 identical "compound interest formula" searches in one run.
_seen_queries: ContextVar[set[str] | None] = ContextVar("seen_queries", default=None)


async def _web_search(query: str) -> list[dict] | str:
    """Search the web and return results (title, url, snippet)."""
    seen = _seen_queries.get()
    key = " ".join(query.lower().split())
    if seen is not None:
        if key in seen:
            return (
                "DUPLICATE SEARCH — you already ran exactly this query and have its "
                "results above. Do not search again; synthesize your answer from what "
                "you already found."
            )
        seen.add(key)
    status_for_current_agent(f"Searching: {query}")
    results = await search.search_text(query)
    if not results:
        # Fail fast and loud: without this, models retry empty searches until they
        # burn the whole request cap (seen live when the search backend degraded).
        return (
            "NO RESULTS — the search backend may be degraded. Do not retry more than "
            "once; answer from what you already have and say so."
        )
    record_sources([Source(title=r.title or r.url, url=r.url) for r in results if r.url])
    return [{"title": r.title, "url": r.url, "snippet": r.snippet} for r in results]


def _worker() -> Agent:
    return Agent(
        worker_model(),
        tools=[Tool(_web_search, name="web_search", description=get_prompt("tools/web_search"))],
        instructions=get_prompt("subagents/researcher", today=now_str(tz_var.get())),
        retries=get_settings().limits.output_retries,
    )


async def _run_worker(subtask: str) -> Finding:
    aid = uuid.uuid4().hex[:8]
    agent_update(aid, label=subtask, status="Researching…", state="running")
    token = agent_var.set(aid)
    _seen_queries.set(set())  # fresh dedupe scope for this worker's searches
    limit = get_settings().limits.worker_request_limit
    try:
        result = await _worker().run(subtask, usage_limits=UsageLimits(request_limit=limit))
        record_llm(runtime.model_for("worker"), result.usage)
        agent_update(aid, status="Done", state="done")
        return Finding(subtask=subtask, summary=str(result.output))
    except UsageLimitExceeded as exc:  # hit the search cap — keep going with what we have
        agent_update(aid, status="Done", state="done")
        log.info("worker [%s] hit search cap (%d): %s", aid, limit, exc)
        return Finding(
            subtask=subtask,
            summary="(reached the search limit before finishing; based on the sources found so far)",
        )
    except Exception as exc:  # one worker failing shouldn't sink the whole answer
        agent_update(aid, status="Failed", state="error")
        log.warning("worker failed [%s] %r: %s", aid, subtask[:60], exc)
        return Finding(subtask=subtask, summary=f"(could not research: {exc})")
    finally:
        agent_var.reset(token)


async def research(subtasks: list[str]) -> list[Finding]:
    """Research subtasks in parallel — one worker agent each — and return findings."""
    if not subtasks:
        return []
    log.info("research: %d subtask(s): %s", len(subtasks), [s[:40] for s in subtasks])
    findings = list(await asyncio.gather(*(_run_worker(s) for s in subtasks)))
    record_findings([(f.subtask, f.summary) for f in findings])
    return findings


async def find_images(query: str, must_show: str = "") -> list[ImageHit]:
    """Find images for a query; if must_show is set, vision-verify that attribute."""
    aid = uuid.uuid4().hex[:8]
    agent_update(aid, label=f"Images: {query}", status="Searching images…", state="running")
    try:
        candidates = await search.search_images(query)
        if not must_show:
            agent_update(aid, status="Done", state="done")
            hits = [ImageHit(url=c.image_url, title=c.title, source_url=c.source_url) for c in candidates[:8]]
            record_found_images([h.url for h in hits])
            return hits

        limits = get_settings().limits
        confirmed: list[ImageHit] = []
        for c in candidates[: limits.max_vision_candidates]:
            if len(confirmed) >= limits.max_confirmed_hits:
                break
            agent_update(aid, status=f"Checking: {c.title[:40] or 'image'}")
            if await _vision_yes(c.image_url, f"Does this image show {must_show}?"):
                confirmed.append(ImageHit(url=c.image_url, title=c.title, source_url=c.source_url))
        agent_update(aid, status="Done", state="done")
        record_found_images([h.url for h in confirmed])
        return confirmed
    except Exception as exc:
        agent_update(aid, status="Failed", state="error")
        return []


def _strip_fences(code: str) -> str:
    code = code.strip()
    if code.startswith("```"):
        lines = code.splitlines()
        lines = lines[1:]  # drop opening ```lang
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        code = "\n".join(lines)
    return code


# Extension -> highlight.js language id (fallback to the coder's declared language).
_EXT_LANG = {
    "html": "html", "htm": "html", "xml": "xml", "svg": "xml",
    "js": "javascript", "mjs": "javascript", "jsx": "javascript",
    "ts": "typescript", "tsx": "typescript", "py": "python", "rb": "ruby",
    "go": "go", "rs": "rust", "java": "java", "kt": "kotlin", "c": "c", "h": "c",
    "cpp": "cpp", "cc": "cpp", "hpp": "cpp", "cs": "csharp", "php": "php",
    "swift": "swift", "css": "css", "scss": "scss", "json": "json", "yml": "yaml",
    "yaml": "yaml", "toml": "toml", "ini": "ini", "sh": "bash", "bash": "bash",
    "sql": "sql", "md": "markdown", "txt": "text", "mod": "text", "lua": "lua",
}

# A file boundary the coder emits, e.g. "=== FILE: src/app.py ===" (also tolerates
# "=== File 1: app.py ==="). Only the path is captured.
_FILE_MARKER = re.compile(r"^\s*=+\s*FILE\s*\d*\s*:?\s*(.+?)\s*=+\s*$", re.IGNORECASE)


def _lang_for(path: str, fallback: str) -> str:
    ext = path.rsplit(".", 1)[-1].lower() if "." in path else ""
    return _EXT_LANG.get(ext, fallback or "code")


def _split_files(output: str, fallback_language: str) -> list[tuple[str, str, str | None]]:
    """Split coder output into (language, content, filename) per file.

    Honors ``=== FILE: path ===`` markers so multi-file results render as separate,
    downloadable blocks. With no markers it's a single unnamed snippet.
    """
    lines = output.splitlines()
    marks = [
        (i, m.group(1).strip())
        for i, line in enumerate(lines)
        if (m := _FILE_MARKER.match(line))
    ]
    if not marks:
        code = _strip_fences(output)
        return [(fallback_language or "code", code, None)] if code.strip() else []
    files: list[tuple[str, str, str | None]] = []
    for idx, (line_no, path) in enumerate(marks):
        end = marks[idx + 1][0] if idx + 1 < len(marks) else len(lines)
        body = _strip_fences("\n".join(lines[line_no + 1 : end]).strip("\n"))
        if body.strip():
            files.append((_lang_for(path, fallback_language), body, path))
    return files


# A targeted edit block the coder emits in edit mode (aider-style search/replace).
_EDIT_RE = re.compile(
    r"<{5,}\s*SEARCH\s*\n(.*?)\n?={5,}\s*\n(.*?)\n?>{5,}\s*REPLACE", re.DOTALL
)


def _locate(content: str, search: str) -> tuple[int, int] | None:
    """Find the unique position of ``search`` in ``content``. Exact match first,
    then a per-line match that forgives trailing whitespace. None if absent/ambiguous."""
    idx = content.find(search)
    if idx != -1:
        return (idx, idx + len(search)) if content.find(search, idx + 1) == -1 else None
    c_lines = content.split("\n")
    s_lines = [l.rstrip() for l in search.split("\n")]
    hits = [
        i
        for i in range(len(c_lines) - len(s_lines) + 1)
        if all(c_lines[i + j].rstrip() == s_lines[j] for j in range(len(s_lines)))
    ]
    if len(hits) != 1:
        return None
    start = sum(len(l) + 1 for l in c_lines[: hits[0]])
    end = start + sum(len(l) + 1 for l in c_lines[hits[0] : hits[0] + len(s_lines)]) - 1
    return start, end


def _apply_edits(content: str, pairs: list[tuple[str, str]]) -> str | None:
    """Apply search/replace pairs in order; None as soon as one doesn't fit cleanly."""
    for search, replace in pairs:
        if not search.strip():
            return None
        loc = _locate(content, search)
        if loc is None:
            return None
        content = content[: loc[0]] + replace + content[loc[1] :]
    return content


async def _run_coder(prompt_key: str, coder_task: str, live_id: str, live_type: str) -> str:
    """One coder run, streaming its raw output into a live block of ``live_type``."""
    agent = Agent(
        coder_model(),
        instructions=get_prompt(prompt_key, today=now_str(tz_var.get())),
    )
    emit = emit_var.get()
    opened = False

    async def on_events(ctx, event_stream) -> None:
        nonlocal opened
        async for ev in event_stream:
            text = None
            if isinstance(ev, PartStartEvent) and isinstance(ev.part, TextPart):
                text = ev.part.content or ""
            elif isinstance(ev, PartDeltaEvent) and isinstance(ev.delta, TextPartDelta):
                text = ev.delta.content_delta or ""
            if text and emit is not None:
                if not opened:
                    opened = True
                    emit(BlockStartEvent(block_id=live_id, block_type=live_type))
                emit(TextDeltaEvent(block_id=live_id, text=text))

    result = await agent.run(coder_task, event_stream_handler=on_events)
    record_llm(runtime.model_for("coder"), result.usage)
    return str(result.output)


async def write_code(task: str, language: str = "code", artifact_id: str = "") -> str:
    """Write or edit code using the dedicated coding model. Pass artifact_id to modify
    an existing artifact — its current code is handed to the coder automatically. The
    result is shown to the user automatically — do not repeat it in your answer."""
    # Editing an existing artifact: seed the coder with its current content, so the
    # orchestrator never has to (badly) reproduce the code inside the task.
    artifacts = artifacts_var.get() or {}
    editing = artifacts.get(artifact_id) if artifact_id else None
    if artifact_id and editing is None:
        known = ", ".join(f"{k} ({v[0]})" for k, v in artifacts.items()) or "none"
        return f"(unknown artifact_id {artifact_id!r} — this chat's artifacts: {known})"
    coder_task = task
    if editing is not None:
        name, lang0, content = editing
        language = language if language != "code" else lang0
        coder_task = (
            f"=== CURRENT CODE ({name or 'snippet'}, {lang0}) ===\n{content}\n"
            f"=== END CURRENT CODE ===\n\nRequested changes:\n{task}"
        )
    # Guardrails against runaway re-coding (seen live: a "fix it" turn produced three
    # different games). Exact duplicates are refused, and no turn runs the coder more
    # than twice — eager models otherwise hedge with rewrite after rewrite, since they
    # can't verify the result themselves. Keyed on the CHANGES text, not the seeded code.
    seen = code_tasks_var.get()
    key = f"{artifact_id}|" + " ".join(task.split())[:500]
    if seen is not None:
        if key in seen:
            return (
                "(this exact artifact was already written by an earlier write_code call "
                "this turn and is shown to the user — do not call write_code again)"
            )
        if editing is None and "create" in seen.values():
            return (
                "(REFUSED: an artifact was already created this turn and is shown to the "
                "user — never produce a second version. To change it, call write_code "
                "with its artifact_id; otherwise give your final answer now.)"
            )
        if len(seen) >= 2:
            return (
                "(REFUSED: the coder already ran twice this turn. Do NOT write another "
                "version — the existing code is shown to the user. Give your final "
                "answer now, describing what was built.)"
            )
        seen[key] = "edit" if editing is not None else "create"

    aid = uuid.uuid4().hex[:8]
    # Label from the CHANGES text (truncated) — never the seeded code.
    verb_label = "Editing" if editing is not None else "Coding"
    agent_update(aid, label=f"{verb_label}: {task[:300]}", status="Writing code…", state="running")
    try:
        # Edits go patch-first: the coder emits small search/replace blocks (streamed
        # to the UI as live diff hunks) that we apply to the stored artifact. If a
        # block doesn't fit — or the coder judged the change sweeping and returned a
        # full file — we fall back to full-file mode. Creates go straight to full-file.
        if editing is not None:
            agent_update(aid, status="Making targeted changes…")
            out = await _run_coder("subagents/coder_edit", coder_task, f"live-{aid}", "edit")
            pairs = [(s, r) for s, r in _EDIT_RE.findall(out)]
            if pairs:
                patched = _apply_edits(content, pairs)
                if patched is not None:
                    record_edits(
                        EditsBlock(
                            artifact_id=artifact_id,
                            name=name or None,
                            changes=[EditChange(old=s, new=r) for s, r in pairs],
                        )
                    )
                    record_code(lang0, patched, name or None, artifact_id)
                    agent_update(aid, status="Done", state="done")
                    return (
                        f"Updated artifact {artifact_id} with {len(pairs)} targeted "
                        "change(s) — the edit and the updated code are already shown to "
                        "the user. Do not call write_code again unless the user asks for "
                        "further changes."
                    )
                # A block didn't match the file — regenerate the whole thing instead.
                log.info("edit patch failed for %s — falling back to full rewrite", artifact_id)
                agent_update(aid, status="Rewriting the whole file…")
                out = await _run_coder(
                    "subagents/coder",
                    coder_task
                    + "\n\nReturn the COMPLETE updated file (same single-file structure), nothing else.",
                    f"live-{aid}f",
                    "code",
                )
            # No pairs: the coder returned a full file (sweeping change) — use it as-is.
        else:
            out = await _run_coder("subagents/coder", coder_task, f"live-{aid}", "code")

        files = _split_files(out, language)
        if not files:
            return "(the coder returned nothing)"
        # Assign stable artifact ids: an edit keeps its id; a file whose name matches
        # an existing artifact updates that artifact; anything else is a new one.
        by_name = {v[0]: k for k, v in artifacts.items() if v[0]}
        written: list[tuple[str, str | None, int]] = []  # (artifact_id, filename, lines)
        for i, (lang, content, fname) in enumerate(files):
            if editing is not None and i == 0 and len(files) == 1:
                art = artifact_id
            else:
                art = by_name.get(fname or "") or uuid.uuid4().hex[:8]
            record_code(lang, content, fname, art)
            written.append((art, fname, content.count(chr(10)) + 1))
        agent_update(aid, status="Done", state="done")
        verb = "Updated" if editing is not None else "Wrote"
        desc = ", ".join(
            f"artifact {art}" + (f" ({fname}, {n} lines)" if fname else f" ({n} lines)")
            for art, fname, n in written
        )
        return (
            f"{verb} {desc} — already shown to the user. Do not call write_code again "
            "unless the user asks for further changes; to modify later, pass its artifact_id."
        )
    except Exception as exc:
        agent_update(aid, status="Failed", state="error")
        log.warning("coder failed: %s", exc)
        return f"(could not write code: {exc})"


async def make_document(title: str, content_markdown: str) -> str:
    """Turn markdown content into a downloadable, nicely typeset PDF for the user."""
    user_id = user_var.get()
    if user_id is None:
        return "(cannot generate documents in this context)"
    # One document per title per turn — models hedge-call generation tools.
    seen_docs = doc_tasks_var.get()
    key = " ".join(title.lower().split())
    if seen_docs is not None:
        if key in seen_docs:
            return (
                "(that document was already created this turn and is shown to the user "
                "as a download — do not call make_document again)"
            )
        if len(seen_docs) >= 3:
            return "(REFUSED: enough documents for one turn — give your final answer)"
        seen_docs[key] = "made"
    aid = uuid.uuid4().hex[:8]
    agent_update(aid, label=f"Document: {title}", status="Typesetting PDF…", state="running")
    try:
        from sqlmodel import Session

        from app.agent.clock import now_str
        from app.db import engine
        from app.documents import render_pdf, store_export
        from app.schema import FileBlock

        # Rendering is CPU-bound — keep the event loop responsive.
        data = await asyncio.to_thread(render_pdf, title, content_markdown, now_str(tz_var.get()))
        safe = re.sub(r"[^\w\s-]", "", title).strip().replace(" ", "-")[:60] or "document"
        name = f"{safe}.pdf"
        from app.agent.activity import dk_var

        with Session(engine) as session:
            uid = store_export(session, user_id, name, data, "application/pdf", "pdf", dk=dk_var.get())
        record_file(FileBlock(name=name, url=f"/api/uploads/{uid}", mime="application/pdf", size=len(data)))
        agent_update(aid, status="Done", state="done")
        return (
            f"Created '{name}' ({len(data) // 1024} KB) — it appears as a download in your "
            "answer automatically. Do not repeat the document's contents; a one-line intro is enough."
        )
    except Exception as exc:
        agent_update(aid, status="Failed", state="error")
        log.warning("make_document failed: %s", exc)
        return f"(could not create the document: {exc})"


def _images_made_this_turn() -> int:
    return sum(1 for k in (dispatch_var.get() or {}) if k.startswith("imagegen|"))


def _image_quota_check(user_id: int) -> tuple[int | None, int, str | None]:
    """Weekly allowance gate: (quota, used_this_week, refusal). refusal is a ready
    tool-return string when the allowance is spent — BEFORE any provider call."""
    from app.usage import images_this_week, week_window

    quota = image_quota_var.get()
    if quota is None:
        return None, 0, None
    used = images_this_week(user_id)
    if used >= quota:
        _, resets = week_window()
        return quota, used, (
            f"(REFUSED: the user's weekly image allowance ({quota}) is used up — it "
            f"resets {resets.strftime('%A, %b %d')}. Tell them kindly and plainly; "
            "do not generate or edit more images this turn.)"
        )
    return quota, used, None


def _image_quota_notify(quota: int | None, used_before: int) -> None:
    """Post-generation: the quota stays invisible until ≤10% remains — then every
    image shows a quiet client-side toast (per explicit product decision)."""
    from app.usage import week_window

    if quota is None:
        return
    used_now = used_before + 1
    remaining = max(0, quota - used_now)
    if remaining <= max(1, quota // 10):
        emit = emit_var.get()
        if emit is not None:
            _, resets = week_window()
            emit(ImageQuotaEvent(used=used_now, remaining=remaining, resets_at=resets.isoformat()))


def _store_gen_image(user_id: int, data: bytes, mime: str, prompt: str, model: str, aid: str) -> None:
    """Persist a generated/edited image (sealed bytes + sealed prompt/model meta for
    the Gallery), record usage, and attach it to this answer's gallery block."""
    import json as _json

    from sqlmodel import Session

    from app import usage
    from app.agent import imagegen
    from app.agent.activity import dk_var
    from app.auth import crypto as _crypto
    from app.db import engine
    from app.documents import store_export
    from app.schema import GalleryImage

    ext = imagegen.ext_for(mime)
    dk = dk_var.get()
    meta = {"prompt": prompt, "model": model}
    gen_meta = _crypto.encrypt_json(dk, meta) if dk is not None else _json.dumps(meta)
    with Session(engine) as session:
        uid = store_export(
            session, user_id, f"image-{aid}.{ext}", data, mime, ext,
            dk=dk, kind="genimage", gen_meta=gen_meta,
        )
    usage.record_image(model)
    record_gen_image(GalleryImage(url=f"/api/uploads/{uid}", caption=prompt[:200]), model)


def _load_gen_images(user_id: int, count: int) -> list[tuple[str, bytes, str]]:
    """The user's generated images, newest first, as (mime, bytes, prompt) —
    unsealed with the turn's data key."""
    from sqlmodel import Session, select

    from app.agent.activity import dk_var
    from app.auth import crypto as _crypto
    from app.db import engine
    from app.models import Upload
    from app.uploads import _gen_meta, _path

    dk = dk_var.get()
    out: list[tuple[str, bytes, str]] = []
    with Session(engine) as session:
        rows = session.exec(
            select(Upload)
            .where(Upload.user_id == user_id, Upload.kind == "genimage")
            .order_by(Upload.created_at.desc())
            .limit(count)
        ).all()
        for up in rows:
            path = _path(up)
            if not path.exists() or (up.enc and dk is None):
                continue
            data = path.read_bytes()
            if up.enc:
                data = _crypto.decrypt_bytes(dk, data)
            if data is None:
                continue
            out.append((up.mime, data, str(_gen_meta(up, dk).get("prompt", ""))))
    return out


# Unambiguous data-viz phrasing — these belong in chart/diagram blocks, not in a
# paid image-model call (seen live: four generated "line chart" images alongside a
# perfectly good chart block).
_DATAVIZ_RE = re.compile(
    r"\b(line chart|bar chart|pie chart|donut chart|area chart|scatter ?plot|"
    r"line graph|bar graph|infographic|x[- ]axis|y[- ]axis|data visuali[sz]|"
    r"flow ?chart|chart (showing|comparing|of)|graph (showing|comparing|of)|"
    r"break[- ]?even|trend ?line)\b",
    re.IGNORECASE,
)


async def generate_image(
    prompt: str, aspect_ratio: str = "", quality: bool = False, user_wants_image: bool = False
) -> str:
    """Create a brand-new image from a text description (OpenRouter image model).
    quality=True routes to the slower top-quality model for demanding asks.
    The result is shown in the answer automatically."""
    user_id = user_var.get()
    if user_id is None:
        return "(cannot generate images in this context)"
    if _DATAVIZ_RE.search(prompt) and not user_wants_image:
        return (
            "(REFUSED: that's a data visualization — render it as a chart block "
            "(bar/line/area/pie/donut, with real axes and a legend, free and instant) "
            "or a Mermaid diagram instead of generating an image. Only if the USER "
            "explicitly asked for a generated PICTURE of it, call again with "
            "user_wants_image=true.)"
        )
    # Exactly-once per prompt + a per-turn cap — models hedge-call generation tools.
    made = _images_made_this_turn()
    if not claim_dispatch("imagegen|" + " ".join(prompt.lower().split())[:300]):
        return (
            "(that exact image was already generated this turn and is shown to the "
            "user — do not call generate_image again)"
        )
    max_per_turn = get_settings().images.max_per_turn
    if made >= max_per_turn:
        return f"(REFUSED: already generated {max_per_turn} image(s) this turn — give your final answer)"
    quota, used_before, refusal = _image_quota_check(user_id)
    if refusal:
        return refusal
    aid = uuid.uuid4().hex[:8]
    agent_update(aid, label=f"Image: {prompt[:300]}", status="Generating…", state="running")
    try:
        from app.agent import imagegen

        model = runtime.image_model_quality() if quality else runtime.image_model()
        data, mime = await imagegen.generate(prompt, aspect_ratio, model=model)
        _store_gen_image(user_id, data, mime, prompt, model, aid)
        _image_quota_notify(quota, used_before)
        agent_update(aid, status="Done", state="done")
        return (
            f"Image generated ({made + 1}/{max_per_turn} this turn) — it is already shown "
            "in your answer. Do not embed links, markdown images, or gallery blocks for "
            "it. If the user asked for several distinct subjects, call generate_image "
            "again for each remaining one; otherwise a short intro is enough."
        )
    except Exception as exc:
        agent_update(aid, status="Failed", state="error")
        log.warning("generate_image failed: %s", exc)
        return f"(could not generate the image: {exc})"


async def edit_image(instruction: str, source: str = "generated") -> str:
    """Image-to-image: apply an edit instruction to the newest generated image
    (source="generated") or to the image the user attached (source="attached").
    The result is shown in the answer automatically."""
    user_id = user_var.get()
    if user_id is None:
        return "(cannot edit images in this context)"
    made = _images_made_this_turn()
    if not claim_dispatch("imagegen|edit|" + " ".join(instruction.lower().split())[:300]):
        return (
            "(that exact edit was already made this turn and is shown to the user — "
            "do not call edit_image again)"
        )
    max_per_turn = get_settings().images.max_per_turn
    if made >= max_per_turn:
        return f"(REFUSED: already made {max_per_turn} image(s) this turn — give your final answer)"
    quota, used_before, refusal = _image_quota_check(user_id)
    if refusal:
        return refusal
    aid = uuid.uuid4().hex[:8]
    agent_update(aid, label=f"Edit: {instruction[:300]}", status="Fetching the source image…", state="running")
    try:
        from app.agent import imagegen

        if source == "attached":
            atts = attachments_var.get() or []
            if not atts:
                agent_update(aid, status="Failed", state="error")
                return (
                    "(no image is attached to this message — ask the user to attach one, "
                    "or use source='generated' to edit the latest generated image)"
                )
            src_mime, src = atts[0]
        else:
            gen = _load_gen_images(user_id, 1)
            if not gen:
                agent_update(aid, status="Failed", state="error")
                return "(no generated image found to edit — generate one first, or ask for an attachment)"
            src_mime, src, _ = gen[0]
        agent_update(aid, status="Editing…")
        model = runtime.image_model_edit()
        data, mime = await imagegen.edit(instruction, src, src_mime, model=model)
        _store_gen_image(user_id, data, mime, instruction, model, aid)
        _image_quota_notify(quota, used_before)
        agent_update(aid, status="Done", state="done")
        return (
            f"Image edited ({made + 1}/{max_per_turn} this turn) — the result is already "
            "shown in your answer and saved to the user's gallery. Do not embed links or "
            "gallery blocks for it; a short intro is enough. Edits chain: another "
            "edit_image with source='generated' refines THIS result."
        )
    except Exception as exc:
        agent_update(aid, status="Failed", state="error")
        log.warning("edit_image failed: %s", exc)
        return f"(could not edit the image: {exc})"


async def look_generated(question: str, count: int = 1) -> str:
    """Examine the user's most recently GENERATED image(s) (newest first) with the
    vision model and answer a question about them."""
    user_id = user_var.get()
    if user_id is None:
        return "(cannot access images in this context)"
    count = max(1, min(int(count), 4))
    aid = uuid.uuid4().hex[:8]
    agent_update(aid, label=f"Reviewing {count} generated image(s)", status="Opening…", state="running")
    try:
        imgs = _load_gen_images(user_id, count)
        if not imgs:
            agent_update(aid, status="Done", state="done")
            return "(no generated images found for this user — generate one first, or they were deleted)"
        agent_update(aid, status="Examining…")
        agent = Agent(vision_model())
        content: list = [
            question if len(imgs) == 1 else f"{question}\n(The images are ordered newest first.)"
        ]
        content += [BinaryContent(data=d, media_type=m) for m, d, _ in imgs]
        r = await agent.run(content)
        record_llm(runtime.model_for("vision"), r.usage)
        agent_update(aid, status="Done", state="done")
        prompts = "; ".join(f"«{p[:100]}»" for _, _, p in imgs if p)
        return str(r.output) + (f"\n\n(Generation prompt(s), newest first: {prompts})" if prompts else "")
    except Exception as exc:
        agent_update(aid, status="Failed", state="error")
        log.warning("look_generated failed: %s", exc)
        return f"(could not view the generated image: {exc})"


async def _vision_yes(image_url: str, question: str) -> bool:
    try:
        data = await fetch_image_bytes(image_url)
    except ImageFetchError:
        return False
    agent = Agent(vision_model())
    r = await agent.run([
        f"Answer with exactly one word, yes or no: {question}",
        BinaryContent(data=data, media_type=guess_media_type(data)),
    ])
    record_llm(runtime.model_for("vision"), r.usage)
    return r.output.strip().lower().startswith("y")


async def look(question: str) -> str:
    """Examine the image(s) the user attached to this message and answer a question."""
    atts = attachments_var.get() or []
    if not atts:
        return "No image is attached to this message."
    # The attachment shows the state from BEFORE this turn's changes — re-examining
    # it cannot verify an edit. Two looks per turn is plenty.
    seen_looks = looks_var.get()
    if seen_looks is not None:
        if len(seen_looks) >= 2:
            return (
                "(REFUSED: the image was already examined this turn — see the earlier "
                "results. It shows the state BEFORE your changes, so looking again "
                "cannot verify anything. Finish your answer.)"
            )
        seen_looks.append(question[:100])
    aid = uuid.uuid4().hex[:8]
    agent_update(aid, label=f"Looking at {len(atts)} image(s)", status="Examining…", state="running")
    try:
        agent = Agent(vision_model())
        content: list = [question]
        content += [BinaryContent(data=data, media_type=mime) for mime, data in atts]
        r = await agent.run(content)
        record_llm(runtime.model_for("vision"), r.usage)
        agent_update(aid, status="Done", state="done")
        return str(r.output)
    except Exception as exc:
        agent_update(aid, status="Failed", state="error")
        log.warning("look failed: %s", exc)
        return f"(could not view the image: {exc})"


async def search_document(query: str) -> str:
    """Find the passages most relevant to a query in the document(s) the user attached."""
    chunks = docs_var.get() or []
    if not chunks:
        return "No document is attached to this message."
    aid = uuid.uuid4().hex[:8]
    agent_update(aid, label=f"Searching the document ({len(chunks)} passages)", status="Searching…", state="running")
    try:
        qvec = (await embed_texts([query]))[0]
        top_k = get_settings().limits.rag_top_k
        ranked = rank(qvec, [(i, emb) for i, (_, emb) in enumerate(chunks)], top_k)
        passages = [chunks[i][0] for i in ranked]
        agent_update(aid, status="Done", state="done")
        return "\n\n---\n\n".join(passages) if passages else "Nothing relevant found in the document."
    except Exception as exc:
        agent_update(aid, status="Failed", state="error")
        log.warning("search_document failed: %s", exc)
        return f"(could not search the document: {exc})"


class SketchArea(BaseModel):
    """An LLM-drawn approximate region: a label + polygon vertices as [lat, lon]."""

    label: str
    points: list[list[float]]


async def show_map(
    places: list[str],
    route: bool = False,
    mode: str = "car",
    outline: list[str] | None = None,
    sketch: list[SketchArea] | None = None,
    title: str = "",
) -> str:
    """Geocode places / boundaries and show them on a map (optionally routed)."""
    key = "map|" + "|".join([
        ",".join(sorted(places)), str(route), mode,
        ",".join(sorted(outline or [])), ",".join(sorted(s.label for s in sketch or [])),
    ]).lower()
    if not claim_dispatch(key):
        return (
            "(that exact map was already shown this turn — do not call show_map again; "
            "give your final answer)"
        )
    aid = uuid.uuid4().hex[:8]
    what = ", ".join([*places, *(outline or []), *[s.label for s in sketch or []]])[:80]
    agent_update(aid, label=f"Mapping: {what}", status="Finding places…", state="running")
    try:
        points = []
        misses = []
        for q in places:
            p = await osm.geocode(q)
            (points.append(p) if p else misses.append(q))
        areas: list[MapArea] = []
        area_misses: list[str] = []
        for q in outline or []:
            agent_update(aid, status=f"Outlining {q}…")
            a = await osm.outline(q)
            (areas.append(a) if a else area_misses.append(q))
        for s in sketch or []:
            pts = [p for p in s.points if len(p) == 2]
            if len(pts) >= 3:
                areas.append(MapArea(name=s.label, approximate=True, polygons=[pts]))
        if not points and not areas:
            agent_update(aid, status="Failed", state="error")
            missed = ", ".join([*misses, *area_misses]) or "anything"
            return (
                f"(could not find {missed} — for outlines try the official administrative "
                f"name, e.g. 'Senamiesčio seniūnija, Vilnius' instead of 'Old Town')"
            )
        r = None
        if route and len(points) >= 2:
            agent_update(aid, status="Routing…")
            r = await (osm.transit(points) if mode == "transit" else osm.route(points, profile=mode))
        record_map(MapBlock(points=points, route=r, areas=areas or None, title=title or None))
        agent_update(aid, status="Done", state="done")
        parts = []
        if points:
            parts.append(f"Map shown with {len(points)} place(s): {', '.join(p.name for p in points)}.")
        if areas:
            real = [a.name for a in areas if not a.approximate]
            approx = [a.name for a in areas if a.approximate]
            if real:
                parts.append(f"Outlined (real OSM boundaries): {', '.join(real)}.")
            if approx:
                parts.append(f"Sketched (approximate, drawn dashed): {', '.join(approx)}.")
        if r and r.mode == "transit":
            steps = " → ".join(l.label or "walk" for l in (r.legs or []))
            parts.append(f"Public transport route: about {r.duration_min:.0f} min ({steps}).")
        elif r:
            mode_word = {"car": "by car", "bike": "by bike", "foot": "on foot"}[r.mode]
            parts.append(f"Route: {r.distance_km} km, about {r.duration_min:.0f} min {mode_word}.")
        elif route:
            parts.append("(no route found for that mode — markers only)")
        if misses:
            parts.append(f"Could not find: {', '.join(misses)} (try a simpler/local name).")
        if area_misses:
            parts.append(
                f"No boundary found for: {', '.join(area_misses)} — try the official "
                f"administrative name, or sketch it instead."
            )
        return " ".join(parts)
    except Exception as exc:
        agent_update(aid, status="Failed", state="error")
        log.warning("show_map failed: %s", exc)
        return f"(map failed: {exc})"


def build_tools(image_gen: bool = False) -> list[Tool]:
    tools = [
        Tool(research, name="research", description=get_prompt("tools/research")),
        Tool(find_images, name="find_images", description=get_prompt("tools/find_images")),
        Tool(write_code, name="write_code", description=get_prompt("tools/write_code")),
        Tool(make_document, name="make_document", description=get_prompt("tools/make_document")),
        Tool(look, name="look", description=get_prompt("tools/look")),
        Tool(search_document, name="search_document", description=get_prompt("tools/search_document")),
        Tool(show_map, name="show_map", description=get_prompt("tools/show_map")),
    ]
    # Per-user feature (admin-granted) — only offered to users who may use it.
    if image_gen:
        tools.append(Tool(generate_image, name="generate_image", description=get_prompt("tools/generate_image")))
        tools.append(Tool(edit_image, name="edit_image", description=get_prompt("tools/edit_image")))
        tools.append(Tool(look_generated, name="look_generated", description=get_prompt("tools/look_generated")))
    return tools
