"""Tool registry — one entry per capability.

Each tool binds a handler to a description sourced from the prompt registry
(``tools/<name>``), never an inline string. Adding a tool = add a handler + a
``tools/<name>.md`` prompt + one entry in ``build_tools()``.
"""

from __future__ import annotations

from pydantic import BaseModel
from pydantic_ai import Agent, BinaryContent, Tool

from app.agent import search
from app.agent.images import ImageFetchError, fetch_image_bytes, guess_media_type
from app.agent.ollama import vision_model
from app.config import get_settings
from app.prompts.registry import get_prompt


class TextHit(BaseModel):
    title: str
    url: str
    snippet: str


class ImageHit(BaseModel):
    title: str
    image_url: str
    source_url: str


async def web_search(query: str) -> list[TextHit]:
    results = await search.search_text(query)
    return [TextHit(title=r.title, url=r.url, snippet=r.snippet) for r in results]


async def image_search(query: str) -> list[ImageHit]:
    results = await search.search_images(query)
    return [
        ImageHit(title=r.title, image_url=r.image_url, source_url=r.source_url)
        for r in results
    ]


async def vision_verify(image_url: str, question: str) -> str:
    """Fetch the image and ask the vision model a yes/no question about it."""
    try:
        data = await fetch_image_bytes(image_url)
    except ImageFetchError as exc:
        return f"could not load image: {exc}"
    agent = Agent(vision_model())
    result = await agent.run([
        f"Answer with exactly one word, yes or no: {question}",
        BinaryContent(data=data, media_type=guess_media_type(data)),
    ])
    return result.output.strip().lower()


def build_tools() -> list[Tool]:
    """All orchestrator tools, descriptions pulled from the prompt registry."""
    return [
        Tool(web_search, name="web_search", description=get_prompt("tools/web_search")),
        Tool(image_search, name="image_search", description=get_prompt("tools/image_search")),
        Tool(vision_verify, name="vision_verify", description=get_prompt("tools/vision_verify")),
    ]
