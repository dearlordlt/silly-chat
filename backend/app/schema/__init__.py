"""The product's wire contract: block vocabulary + streaming events.

This package is the SINGLE source of truth for what the orchestrator may emit and
what the frontend renders. Frontend TypeScript types are generated from here
(scripts/gen_ts_types.py) — never hand-mirror this vocabulary.
"""

from app.schema.blocks import (
    Block,
    ChartBlock,
    CodeBlock,
    GalleryBlock,
    GalleryImage,
    Reply,
    TableBlock,
    TextBlock,
)
from app.schema.events import (
    AgentStatusEvent,
    BlockDataEvent,
    BlockStartEvent,
    DoneEvent,
    ErrorEvent,
    StreamEvent,
    TextDeltaEvent,
)

__all__ = [
    "Block",
    "ChartBlock",
    "CodeBlock",
    "GalleryBlock",
    "GalleryImage",
    "Reply",
    "TableBlock",
    "TextBlock",
    "AgentStatusEvent",
    "BlockDataEvent",
    "BlockStartEvent",
    "DoneEvent",
    "ErrorEvent",
    "StreamEvent",
    "TextDeltaEvent",
]
