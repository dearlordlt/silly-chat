"""The orchestrator agent — the product's core.

A capable tool-calling agent that grounds answers, chains tools (search ->
vision_verify), and returns a validated ``Reply`` (block array). System prompt and
mode bias come from the registry; model and retries from config.
"""

from __future__ import annotations

from typing import Literal

from pydantic_ai import Agent, PromptedOutput

from app.agent.clock import now_str
from app.agent.ollama import orchestrator_model
from app.agent.tools import build_tools
from app.config import get_settings
from app.prompts.registry import get_prompt
from app.schema import Reply

Mode = Literal["search", "chat", "code", "images"]


def build_orchestrator(
    mode: Mode = "search", timezone: str | None = None, image_gen: bool = False,
    project_prompt: str = "", project_files: str = "",
    native_vision: bool = False,
) -> Agent[None, Reply]:
    from app.meta import genome

    limits = get_settings().limits
    instructions = get_prompt(
        "orchestrator",
        mode_bias=get_prompt(f"mode_{mode}"),
        max_agents=limits.max_agents,
        today=now_str(timezone),
        image_gen=image_gen,
        # A project's standing instruction belongs in the system prompt, not the user
        # turn: it must survive history trimming and read as behaviour, not as data.
        project_prompt=project_prompt,
        project_files=project_files,
        **genome(),  # version / features / history — the app's self-knowledge
    )
    return Agent(
        orchestrator_model(),
        # PromptedOutput: the model writes the Reply as JSON text. Chosen over
        # ToolOutput because Ollama delivers tool calls only as complete units —
        # text is the only channel that streams, and live answers need deltas.
        # (NativeOutput's constrained decoding breaks tool calling entirely.)
        output_type=PromptedOutput(Reply),
        instructions=instructions,
        tools=build_tools(image_gen, native_vision=native_vision),
        retries=limits.output_retries,
    )
