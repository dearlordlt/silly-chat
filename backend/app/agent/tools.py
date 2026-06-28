"""Orchestrator tools.

The orchestrator delegates: it decides how to break a question into subtasks and
calls ``research`` with that list — one parallel worker agent per subtask. Each
worker searches the web, streams its status, and records the sources it used.
``find_images`` runs the search -> vision-verify image flow as its own agent.

Descriptions come from the prompt registry (SSOT); nothing inline.
"""

from __future__ import annotations

import asyncio
import uuid

from pydantic import BaseModel
from pydantic_ai import Agent, BinaryContent, Tool

from app.agent import search
from app.agent.clock import now_str, tz_var
from app.agent.activity import (
    agent_update,
    agent_var,
    record_findings,
    record_sources,
    status_for_current_agent,
)
from app.agent.images import ImageFetchError, fetch_image_bytes, guess_media_type
from app.agent.ollama import vision_model, worker_model
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
async def _web_search(query: str) -> list[dict]:
    """Search the web and return results (title, url, snippet)."""
    status_for_current_agent(f"Searching: {query}")
    results = await search.search_text(query)
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
    try:
        result = await _worker().run(subtask)
        agent_update(aid, status="Done", state="done")
        return Finding(subtask=subtask, summary=str(result.output))
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
            return [ImageHit(url=c.image_url, title=c.title, source_url=c.source_url) for c in candidates[:8]]

        limits = get_settings().limits
        confirmed: list[ImageHit] = []
        for c in candidates[: limits.max_vision_candidates]:
            if len(confirmed) >= limits.max_confirmed_hits:
                break
            agent_update(aid, status=f"Checking: {c.title[:40] or 'image'}")
            if await _vision_yes(c.image_url, f"Does this image show {must_show}?"):
                confirmed.append(ImageHit(url=c.image_url, title=c.title, source_url=c.source_url))
        agent_update(aid, status="Done", state="done")
        return confirmed
    except Exception as exc:
        agent_update(aid, status="Failed", state="error")
        return []


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
    return r.output.strip().lower().startswith("y")


def build_tools() -> list[Tool]:
    return [
        Tool(research, name="research", description=get_prompt("tools/research")),
        Tool(find_images, name="find_images", description=get_prompt("tools/find_images")),
    ]
