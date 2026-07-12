"""Prompt registry — the single source of truth for ALL prompt text.

No prompt string literal lives in code. Every prompt is a file under this
directory, addressed by a dotted/slashed key (``"orchestrator"``,
``"tools/web_search"``) and rendered through Jinja2 (so prompts can take vars and
``{% include %}`` each other).

Usage:
    from app.prompts.registry import get_prompt
    sys = get_prompt("orchestrator", mode_bias=get_prompt("mode_search"))

Call ``validate_prompts()`` at startup to fail fast if any required prompt file is
missing — rather than at request time.
"""

from __future__ import annotations

from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined, TemplateNotFound

PROMPTS_DIR = Path(__file__).resolve().parent

# Every prompt the app references. Adding a prompt = add its file + list it here.
REQUIRED_PROMPTS: tuple[str, ...] = (
    "orchestrator",
    "mode_search",
    "mode_chat",
    "mode_code",
    "mode_images",
    "tools/web_search",
    "tools/research",
    "tools/find_images",
    "tools/write_code",
    "tools/make_document",
    "tools/generate_image",
    "tools/look",
    "tools/search_document",
    "tools/show_map",
    "subagents/researcher",
    "subagents/coder",
    "subagents/coder_edit",
    "subagents/summarizer",
)

_env = Environment(
    loader=FileSystemLoader(str(PROMPTS_DIR)),
    undefined=StrictUndefined,  # referencing an unset var is an error, not a silent blank
    trim_blocks=True,
    lstrip_blocks=True,
    keep_trailing_newline=False,
    auto_reload=True,  # hot-reload prompt edits in dev without a restart
)


def get_prompt(key: str, **variables) -> str:
    """Render the prompt at ``<key>.md`` with the given template variables."""
    try:
        template = _env.get_template(f"{key}.md")
    except TemplateNotFound as exc:
        raise KeyError(f"prompt not found: {key!r} (expected {PROMPTS_DIR / (key + '.md')})") from exc
    return template.render(**variables).strip()


def validate_prompts() -> None:
    """Assert every required prompt file exists. Raises on the first missing one."""
    missing = [k for k in REQUIRED_PROMPTS if not (PROMPTS_DIR / f"{k}.md").is_file()]
    if missing:
        raise RuntimeError(f"missing prompt files: {missing}")
