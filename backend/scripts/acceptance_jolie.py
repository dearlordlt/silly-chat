"""Acceptance: the worked example from idea.md.

  "Find me a picture of Angelina Jolie wearing a hat."

Exercises the full agentic image flow against the live orchestrator + SearXNG +
vision model: image_search -> vision_verify (top candidates) -> gallery of
confirmed hits. Prints the tool-call trace and the final blocks.

Run:  uv run python scripts/acceptance_jolie.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pydantic_ai import RunContext  # noqa: E402
from pydantic_ai.messages import FunctionToolCallEvent  # noqa: E402

from app.agent.orchestrator import build_orchestrator  # noqa: E402

QUERY = "Find me a picture of Angelina Jolie wearing a hat."


async def main() -> int:
    agent = build_orchestrator("search")
    calls: list[str] = []

    async def on_events(ctx: RunContext, stream) -> None:
        async for ev in stream:
            if isinstance(ev, FunctionToolCallEvent):
                p = ev.part
                arg = ""
                if isinstance(p.args, dict):
                    arg = p.args.get("query") or p.args.get("question") or ""
                calls.append(f"{p.tool_name}({str(arg)[:50]})")

    result = await agent.run(QUERY, event_stream_handler=on_events)

    print("Tool calls:")
    for c in calls:
        print("  -", c)
    n_img = sum(c.startswith("image_search") for c in calls)
    n_vis = sum(c.startswith("vision_verify") for c in calls)
    print(f"\nimage_search: {n_img}  vision_verify: {n_vis}")

    print("\nFinal blocks:")
    galleries = 0
    for b in result.output.blocks:
        if b.type == "gallery":
            galleries += 1
            print(f"  gallery ({len(b.images)} images):")
            for img in b.images:
                print("    -", img.url[:80])
        else:
            print(f"  {b.type}: {getattr(b, 'markdown', '')[:80]}")

    ok = n_img >= 1 and n_vis >= 1 and galleries >= 1
    print("\nACCEPTANCE:", "PASS" if ok else "FAIL (expected image_search + vision_verify + a gallery)")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
