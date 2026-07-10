# Changelog

Feature-level history. The topmost version heading is the app's current version —
the UI, the API (`/api/meta`), and the assistant's own self-knowledge all derive
from this file.

## v1.0.0 — 2026-07-10

The first complete release: an agentic, casual-friendly chat for friends & family.

- **Agentic answers with full transparency** — the assistant plans its own research,
  runs parallel worker agents, and shows every agent live (what it's doing, done/failed),
  with the sources it used cited under grounded answers.
- **Three chat modes** — Search (grounded, web-first), Chat (conversational), and Code
  (builds the artifact first).
- **Rich answers** — text, tables, image galleries with attribution, and a full chart
  family (bar, line, area, pie, donut) with real axes and legends; the assistant picks
  the right form, or none when prose is clearer.
- **Maps** — "where is X" and "how do I get from A to B" render an interactive map with
  real navigation by car, bike, foot, or public transport; real region boundaries
  (districts, countries) can be outlined, and historical/approximate regions sketched
  (drawn dashed). Powered by the free OpenStreetMap ecosystem.
- **Code canvas** — generated code renders with syntax highlighting and line numbers;
  HTML previews inline and can open in a sandboxed tab; multi-file results appear as
  separate downloadable files. Niche/versioned tech is researched in official docs
  before coding, with the docs cited.
- **Attachments** — paste, drag-drop, or upload images (the assistant sees them) and
  documents (PDF, Word, Excel, PowerPoint, text formats) for question-answering over
  their contents. Uploads are size/quota-capped and expire automatically.
- **Chat memory & history** — multi-turn context, editable last message, retry on
  errors, and three storage modes per chat: Off (private), Local (this browser), or
  Server (synced to your account), with per-chat move and delete.
- **Personalization** — 17 Norse-named themes (7 light goddesses, 7 dark gods, 3 mixed),
  separate animated background effects, font choice, and border roundness — all synced
  to your account.
- **Privacy-respecting timezone** — Off, Automatic, or Manual; nothing is sent unless
  you opt in.
- **Accounts & admin** — self-registration with admin approval, roles
  (promote/demote/delete with safety guards), and per-role model configuration
  (main/research/vision/coding/embeddings) applied live.
- **Design system** — the whole UI follows the canonical design document
  (`design/silly-chat-design.html`), light and dark, desktop and mobile.
