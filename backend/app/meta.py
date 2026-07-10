"""App metadata: version, changelog, and help — parsed from the repo's
CHANGELOG.md and HELP.md (the single sources of truth).

The topmost ``## vX.Y.Z`` heading in CHANGELOG.md IS the current version. The same
parsed content feeds the About/Help UI (via /api/meta) and the orchestrator's
self-knowledge (via genome()), so the app can never disagree with itself.
"""

from __future__ import annotations

import re
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

from app.auth.deps import ApprovedUser
from app.config import ROOT

router = APIRouter(prefix="/api/meta", tags=["meta"])

_CHANGELOG = ROOT / "CHANGELOG.md"
_HELP = ROOT / "HELP.md"


class VersionEntry(BaseModel):
    version: str
    date: str | None = None
    notes: list[str]


class HelpSection(BaseModel):
    title: str
    body: str


class Meta(BaseModel):
    version: str
    versions: list[VersionEntry]
    help: list[HelpSection]


_cache: tuple[tuple[float, float], Meta] | None = None


def _parse_changelog(text: str) -> list[VersionEntry]:
    entries: list[VersionEntry] = []
    current: VersionEntry | None = None
    note: list[str] = []

    def flush_note():
        if current is not None and note:
            current.notes.append(" ".join(l.strip() for l in note))
            note.clear()

    for line in text.splitlines():
        m = re.match(r"^##\s+v?([\w.\-]+)(?:\s+—\s+(.*))?$", line)
        if m:
            flush_note()
            current = VersionEntry(version=m.group(1), date=(m.group(2) or "").strip() or None, notes=[])
            entries.append(current)
            continue
        if current is None:
            continue
        if re.match(r"^\s*-\s+", line):
            flush_note()
            note.append(re.sub(r"^\s*-\s+", "", line))
        elif line.strip() and note:
            note.append(line)  # wrapped continuation of the current bullet
    flush_note()
    return entries


def _parse_help(text: str) -> list[HelpSection]:
    sections: list[HelpSection] = []
    title: str | None = None
    body: list[str] = []
    for line in text.splitlines():
        m = re.match(r"^##\s+(.*)$", line)
        if m:
            if title:
                sections.append(HelpSection(title=title, body="\n".join(body).strip()))
            title = m.group(1).strip()
            body = []
        elif title:
            body.append(line)
    if title:
        sections.append(HelpSection(title=title, body="\n".join(body).strip()))
    return sections


def get_meta() -> Meta:
    """Parsed meta, cached until either file changes (hot-reloads in dev)."""
    global _cache
    stamps = (
        _CHANGELOG.stat().st_mtime if _CHANGELOG.exists() else 0.0,
        _HELP.stat().st_mtime if _HELP.exists() else 0.0,
    )
    if _cache and _cache[0] == stamps:
        return _cache[1]
    versions = _parse_changelog(_CHANGELOG.read_text()) if _CHANGELOG.exists() else []
    help_sections = _parse_help(_HELP.read_text()) if _HELP.exists() else []
    meta = Meta(
        version=versions[0].version if versions else "0.0.0",
        versions=versions,
        help=help_sections,
    )
    _cache = (stamps, meta)
    return meta


def genome() -> dict[str, str]:
    """Compact self-knowledge for the orchestrator prompt: version, feature
    one-liners (help section titles + first sentence), and version history."""
    meta = get_meta()
    features = []
    for s in meta.help:
        first = s.body.replace("\n", " ").strip()
        first = first.split(". ")[0].rstrip(".") + "." if first else ""
        features.append(f"- {s.title}: {first}")
    history = []
    for v in meta.versions:
        joined = "; ".join(n.split(" — ")[0].strip("* ") for n in v.notes)
        # keep each release to one compact line
        history.append(f"- v{v.version} ({v.date or 'unreleased'}): {joined[:600]}")
    return {
        "version": meta.version,
        "features": "\n".join(features),
        "history": "\n".join(history),
    }


@router.get("")
def meta_endpoint(_: ApprovedUser) -> Meta:
    return get_meta()
