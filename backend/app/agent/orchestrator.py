"""The orchestrator agent — the product's core.

A capable tool-calling agent that grounds answers, chains tools (search ->
vision_verify), and returns a validated ``Reply`` (block array). System prompt and
mode bias come from the registry; model and retries from config.
"""

from __future__ import annotations

from typing import Literal

from pydantic_ai import Agent, ToolOutput

from app.agent.ollama import orchestrator_model
from app.agent.tools import build_tools
from app.config import get_settings
from app.prompts.registry import get_prompt
from app.schema import Reply

Mode = Literal["search", "chat"]


def build_orchestrator(mode: Mode = "search") -> Agent[None, Reply]:
    instructions = get_prompt("orchestrator", mode_bias=get_prompt(f"mode_{mode}"))
    return Agent(
        orchestrator_model(),
        # ToolOutput: the model returns the Reply via a tool call (reliable for
        # tool-capable models) rather than emitting raw JSON text to be parsed.
        output_type=ToolOutput(Reply),
        instructions=instructions,
        tools=build_tools(),
        retries=get_settings().limits.output_retries,
    )
