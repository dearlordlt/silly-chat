"""Emit the wire contract as JSON Schema for the frontend to turn into TypeScript.

The backend Pydantic models in app/schema are the SINGLE source of truth. This dumps
them to frontend/src/types/contract.schema.json; the frontend's `gen:types` script
converts that to contract.ts. Never hand-edit the generated TS.

Run:  uv run python scripts/gen_ts_types.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from pydantic import BaseModel  # noqa: E402

from app.schema import Reply, StreamEvent  # noqa: E402


class Contract(BaseModel):
    """Wrapper so one schema carries both halves of the contract + all $defs."""

    reply: Reply
    event: StreamEvent


def main() -> None:
    schema = Contract.model_json_schema()
    out = ROOT / "frontend" / "src" / "types" / "contract.schema.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(schema, indent=2) + "\n")
    print(f"wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
