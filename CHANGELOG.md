# Changelog

Feature-level history. The topmost version heading is the app's current version —
the UI, the API (`/api/meta`), and the assistant's own self-knowledge all derive
from this file.

## v1.5.0 — 2026-07-10

- **Presentations** — ask for "a presentation about X in 7 slides" and the assistant
  builds a real slide deck: prev/next navigation, slide dots, and a fullscreen
  present mode with arrow-key control. It researches first when the topic needs
  facts, and picks slides on its own when they explain something better.
- **Link chats as context** — type `@` in the message box to pick another chat
  (arrow keys or click); its content becomes background context for the current
  chat until you unlink it. Linked chats show as small chips above the input.
- **Status line** — the header now shows which model(s) worked the last turn and
  how much of the context window this chat is using (used/total and %).
- **Message timestamps** — every message carries a subtle time (date shown when
  it isn't from today).
- **Live code** — while the coding agent works, you watch the code being written
  line by line instead of staring at a spinner; the finished, downloadable code
  block replaces it when the turn completes.
- **Code artifacts** — code is now a persistent object in the chat, edited in
  place: "make the ball red" updates the same program instead of spawning a new
  variant, the assistant sends the coder only the changes (the current code is
  attached automatically), and old versions no longer bloat the context.
- **Targeted edits with diffs** — small changes no longer rewrite the whole file:
  the coder patches just the affected lines, you watch the changes stream in as
  red/green diffs, and an "Edited — N changes" card stays in the chat next to the
  updated code. Sweeping changes still regenerate the full file automatically.
- **Full chat memory with auto-compaction** — chats no longer forget beyond the
  last 20 messages: the whole history rides along, and when a chat approaches the
  model's context limit (admin-tunable %, default 90) older messages are folded
  into a rolling summary automatically — recent messages stay verbatim.

## v1.4.0 — 2026-07-10

- **Live answers** — the assistant's text now streams onto the screen as it is
  written, instead of appearing all at once at the end.
- **Stop button** — a running answer can be stopped mid-flight; whatever has
  already arrived stays in the chat, and the work is cancelled server-side too.
- **Auto theme** — a new "Auto" option (now the default) follows your device:
  light mode gets Frigg, dark mode gets Bifröst, switching live when the OS does.
- **Chat list paging** — the sidebar shows the 15 most recent chats and a
  "Load more" button, so a long history stays fast; search still scans everything.

## v1.3.0 — 2026-07-10

- **Install as an app (PWA)** — silly-chat can be added to your phone's home screen
  (or desktop) and opens in its own window like a native app: Android/Chrome offer
  "Install app", iOS Safari uses Share → Add to Home Screen.

## v1.2.0 — 2026-07-10

- **One-command VPS deployment** — `./start.sh` now takes silly-chat to a public
  domain: automatic HTTPS (Caddy + Let's Encrypt), a local CPU embedding appliance
  (Ollama Cloud serves chat/vision/coding; embeddings run beside the app), an
  auto-generated session secret, secure cookies, capped log sizes, and a
  `backup.sh` for consistent snapshots of accounts, chats, and uploads.
  See `DEPLOY.md` for the 10-minute runbook.

## v1.1.0 — 2026-07-10

- **Diagrams** — the assistant can draw Mermaid diagrams: architectures, network
  setups, flows, sequences, and entity relationships, themed to match your look.
  Diagrams expand to fullscreen and the Mermaid source can be copied; if a diagram
  fails to render, its source is shown instead.

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
