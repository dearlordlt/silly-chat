"""The product's wire contract: block vocabulary + streaming events.

This package is the SINGLE source of truth for what the orchestrator may emit and
what the frontend renders. Frontend TypeScript types are generated from here
(scripts/gen_ts_types.py) — never hand-mirror this vocabulary.
"""

from app.schema.blocks import (
    Block,
    ChartBlock,
    CodeBlock,
    DiagramBlock,
    EditChange,
    EditsBlock,
    FileBlock,
    GalleryBlock,
    GalleryImage,
    MapArea,
    MapBlock,
    MapLeg,
    MapPoint,
    MapRoute,
    Reply,
    Slide,
    SlidesBlock,
    Source,
    SourcesBlock,
    TableBlock,
    TextBlock,
)
from app.schema.events import (
    AgentStatusEvent,
    AgentUpdateEvent,
    BlockDataEvent,
    BlockStartEvent,
    DoneEvent,
    ErrorEvent,
    ImageQuotaEvent,
    StreamEvent,
    TextDeltaEvent,
)

__all__ = [
    "Block",
    "ChartBlock",
    "CodeBlock",
    "EditChange",
    "EditsBlock",
    "FileBlock",
    "GalleryBlock",
    "GalleryImage",
    "Reply",
    "Slide",
    "SlidesBlock",
    "Source",
    "SourcesBlock",
    "TableBlock",
    "TextBlock",
    "AgentStatusEvent",
    "AgentUpdateEvent",
    "BlockDataEvent",
    "BlockStartEvent",
    "DoneEvent",
    "ErrorEvent",
    "ImageQuotaEvent",
    "StreamEvent",
    "TextDeltaEvent",
]
