"""Block vocabulary — the fixed component library the model fills.

A discriminated union on ``type``. The orchestrator's final output is a ``Reply``
(a validated list of blocks). Locking this vocabulary early is deliberate: it is
the product's UI language and is expensive to change later.

Adding a block = add a model here + a renderer in frontend/src/components/blocks/.
Workers return raw data; only the orchestrator wraps data into these blocks.
"""

from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field


class TextBlock(BaseModel):
    type: Literal["text"] = "text"
    markdown: str


class TableBlock(BaseModel):
    type: Literal["table"] = "table"
    columns: list[str]
    rows: list[list[str]]


class GalleryImage(BaseModel):
    url: str
    caption: str | None = None
    source_url: str | None = Field(
        default=None, description="Page the image was found on, for attribution."
    )


class GalleryBlock(BaseModel):
    type: Literal["gallery"] = "gallery"
    images: list[GalleryImage]


class ChartSeries(BaseModel):
    name: str
    values: list[float]


class ChartBlock(BaseModel):
    type: Literal["chart"] = "chart"
    kind: Literal["bar", "line", "area", "pie", "donut"]
    # Simple label/value data; keep dumb so any cheap model can fill it.
    labels: list[str]
    values: list[float] = Field(
        default_factory=list, description="Values for a single series (one per label)."
    )
    series: list[ChartSeries] | None = Field(
        default=None,
        description="For comparisons: several named series (each one value per label); rendered with a legend.",
    )
    title: str | None = None


class CodeBlock(BaseModel):
    type: Literal["code"] = "code"
    language: str
    content: str
    filename: str | None = Field(
        default=None, description="Relative path/name when the code is a real file (enables download)."
    )


class MapPoint(BaseModel):
    name: str
    lat: float
    lon: float


class MapRoute(BaseModel):
    distance_km: float
    duration_min: float
    mode: Literal["car", "bike", "foot"] = "car"
    # Route geometry as [lat, lon] pairs, ready for the map renderer.
    geometry: list[list[float]]


class MapBlock(BaseModel):
    """A map with resolved locations (and optionally a route between them).

    Never authored by the model directly — the ``show_map`` tool geocodes real
    coordinates and records this block, so positions can't be hallucinated.
    """

    type: Literal["map"] = "map"
    points: list[MapPoint]
    route: MapRoute | None = None
    title: str | None = None


class Source(BaseModel):
    title: str
    url: str


class SourcesBlock(BaseModel):
    """Citations — the proof behind a grounded answer."""

    type: Literal["sources"] = "sources"
    items: list[Source]


Block = Annotated[
    Union[TextBlock, TableBlock, GalleryBlock, ChartBlock, CodeBlock, MapBlock, SourcesBlock],
    Field(discriminator="type"),
]

# What the MODEL may emit: everything except maps — those carry geocoded coordinates
# and are appended by the show_map tool, so the model can't hallucinate positions
# (it tried: it would echo a made-up 2-point "route" and shadow the real one).
ModelBlock = Annotated[
    Union[TextBlock, TableBlock, GalleryBlock, ChartBlock, CodeBlock, SourcesBlock],
    Field(discriminator="type"),
]


class Reply(BaseModel):
    """The orchestrator's final structured answer."""

    blocks: list[ModelBlock]
