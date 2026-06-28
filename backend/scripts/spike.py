"""Phase 0 de-risk spike.

Proves the three things the whole product rests on, against the configured
Ollama endpoint (local daemon or Ollama Cloud):

  1. Reliable tool-calling + tool-chaining.
  2. Structured discriminated-union "block array" output.
  3. Vision yes/no on a real image (the `vision_verify` primitive).

Run:  uv run python scripts/spike.py
Exit gate: all three PASS before building the rest.
"""

from __future__ import annotations

import asyncio
import sys
from typing import Literal, Union

import httpx
from pydantic import BaseModel
from pydantic_ai import Agent, BinaryContent
from pydantic_ai.models.ollama import OllamaModel
from pydantic_ai.providers.ollama import OllamaProvider

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))
from app.config import get_settings  # noqa: E402

S = get_settings()
PROVIDER = OllamaProvider(base_url=S.ollama.base_url, api_key=S.ollama_api_key)

# A bot-friendly real image with known content (a dog). Ollama /v1 needs the raw
# bytes (base64) — it rejects image URLs — so we fetch them ourselves, exactly as
# vision_verify will in production.
TEST_IMAGE = "https://raw.githubusercontent.com/pytorch/hub/master/images/dog.jpg"


def agent(model_name: str, **kw) -> Agent:
    return Agent(OllamaModel(model_name, provider=PROVIDER), **kw)


def fetch_image(url: str) -> bytes:
    b = httpx.get(
        url, timeout=30, follow_redirects=True,
        headers={"User-Agent": "silly-chat/0.1 (+https://github.com/dearlordlt/silly-chat)"},
    ).content
    if not (b[:3] == b"\xff\xd8\xff" or b[:8] == b"\x89PNG\r\n\x1a\n"):
        raise RuntimeError(f"not a valid image ({len(b)} bytes, head={b[:8]!r})")
    return b


async def test_tool_chaining() -> bool:
    calls: list[tuple] = []
    a = agent(S.models.orchestrator)

    @a.tool_plain
    def add(x: int, y: int) -> int:
        "Add two integers."
        calls.append(("add", x, y)); return x + y

    @a.tool_plain
    def multiply(x: int, y: int) -> int:
        "Multiply two integers."
        calls.append(("multiply", x, y)); return x * y

    r = await a.run("What is (3 + 4) * 5? Use the tools step by step.")
    ok = ("35" in r.output) and any(c[0] == "add" for c in calls) and any(c[0] == "multiply" for c in calls)
    print(f"  output={r.output[:60]!r} calls={calls}")
    return ok


async def test_structured_output() -> bool:
    class TextBlock(BaseModel):
        type: Literal["text"]; markdown: str

    class TableBlock(BaseModel):
        type: Literal["table"]; columns: list[str]; rows: list[list[str]]

    class Reply(BaseModel):
        blocks: list[Union[TextBlock, TableBlock]]

    # output_retries: cheap models occasionally emit a malformed payload; pydantic-ai
    # feeds the validation error back and the model self-corrects (the "repair pass").
    a = agent(S.models.worker, output_type=Reply, retries=3)
    r = await a.run(
        "Make a table of the 3 largest planets (columns Name, Diameter_km), "
        "preceded by one short intro text block."
    )
    types = [b.type for b in r.output.blocks]
    ok = "table" in types
    print(f"  block types={types}")
    return ok


async def test_vision() -> bool:
    img = fetch_image(TEST_IMAGE)
    a = agent(S.models.vision)

    async def ask(predicate: str) -> str:
        r = await a.run([
            f"Answer with exactly one word, yes or no: {predicate}",
            BinaryContent(data=img, media_type="image/jpeg"),
        ])
        return r.output.strip().lower()

    pos = await ask("is there an animal in this image?")
    neg = await ask("is there a car in this image?")
    ok = pos.startswith("yes") and neg.startswith("no")
    print(f"  animal?={pos!r}  car?={neg!r}")
    return ok


async def main() -> int:
    print(f"Endpoint: {S.ollama.base_url}")
    print(f"Models: orchestrator={S.models.orchestrator} worker={S.models.worker} vision={S.models.vision}\n")
    tests = [
        ("tool-chaining", test_tool_chaining),
        ("structured output", test_structured_output),
        ("vision yes/no", test_vision),
    ]
    results = {}
    for name, fn in tests:
        print(f"[{name}]")
        try:
            results[name] = await fn()
        except Exception as e:
            results[name] = False
            print(f"  ERROR {type(e).__name__}: {str(e)[:160]}")
        print(f"  -> {'PASS' if results[name] else 'FAIL'}\n")

    all_pass = all(results.values())
    print("=" * 40)
    for name, ok in results.items():
        print(f"  {'PASS' if ok else 'FAIL'}  {name}")
    print("=" * 40)
    print("\nEXIT GATE:", "OPEN — proceed" if all_pass else "BLOCKED")
    return 0 if all_pass else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
