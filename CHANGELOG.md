# Changelog

Feature-level history. The topmost version heading is the app's current version —
the UI, the API (`/api/meta`), and the assistant's own self-knowledge all derive
from this file.

## v1.12.0 — 2026-07-12

- **Image gallery** — your generated images now have a home: Gallery (in the user
  menu) shows every image the assistant made for you with the prompt that made it
  and the model used, fullscreen view + download, and delete. Prompts are stored
  sealed under your key like everything else. Generated images no longer expire
  after a week — they stay until you delete them.
- **The assistant can see its own creations** — ask about a generated image
  ("does she actually hold a sword?", "make the next one match this style") and it
  examines the real picture with its vision model, prompt in hand, instead of
  guessing from memory.

## v1.11.1 — 2026-07-12

- Fixes: multi-subject image requests ("portraits for my 4 party members") now
  reliably generate one image per subject into a single gallery — previously the
  assistant sometimes generated one and only pretended to do the rest.

## v1.11.0 — 2026-07-12

- **Weekly image quotas** — admins can give each person a weekly image allowance
  (Users → ⋯ → Image quota; a server default covers everyone else, admins are
  unlimited). Deliberately invisible until it matters: when ≤10% remains, each
  generation shows a small dismissable notice ("X generated this week, Y left,
  resets Monday"), and when it's used up the assistant says so and when it resets.
- Fixed: the assistant sometimes invented broken image frames next to real
  generated pictures (hallucinated image URLs) — image galleries it writes are now
  verified against what its tools actually returned, so only real images render.

## v1.10.0 — 2026-07-12

- **Fast & quality image models** — Admin → Images now configures a model pair: a
  fast default (Grok) and an optional top-quality one (GPT Image). The assistant
  routes each request itself — "a cat in a hat" comes back in seconds from the fast
  model, "super realistic 1900 London" goes to the quality one; statistics and the
  models chip show whichever actually ran.

## v1.9.1 — 2026-07-12

- Fixes: Admin → Images — the API key and the model now save with separate buttons,
  and browser autofill can no longer silently overwrite the stored key when saving
  an unrelated change; the model picker shows friendly names sorted alphabetically
  (it always listed only image-capable models — OpenRouter's image catalog is just
  that big).

## v1.9.0 — 2026-07-12

- **Images mode** — people with image generation get a fourth pill next to
  Search/Chat/Code: in Images mode the assistant treats any describable idea as a
  picture request and generates it straight away, elaborating your words into a
  proper image prompt.
- **Image lightbox** — click any image in an answer (generated or found) to view it
  fullscreen; a download button saves it, and found images keep a link to their
  source page.
- Image requests are no longer pre-moderated by the assistant's own taste — the
  image provider's content policy is the arbiter, and its refusals are relayed
  plainly instead of second-guessed.
- Fixes: research agents were broken by v1.8.0's usage accounting (all research
  returned "could not research"); the assistant no longer replies about internal
  "invalid JSON" validator messages as if the user had sent an error.

## v1.8.0 — 2026-07-12

- **Image generation** — ask the assistant to draw or design something ("draw me…",
  "make an image of…") and it creates the picture with an AI image model via
  OpenRouter (Grok by default). Per-user switch: admins have it on by default and
  can enable or disable it for anyone in Admin → Users; the OpenRouter API key and
  the image model are picked in Admin → Images. Generated images are sealed under
  your key like any attachment.
- **Usage statistics** — new Admin → Statistics: tokens used per person and per
  model, plus images generated, with time filters (today, 2/3 days, week, month,
  all time). Counts only — message contents are never stored or shown.

## v1.7.0 — 2026-07-11

- **Attachments encrypted too** — uploaded images, documents (including the text
  snippets used to answer questions about them), and generated PDFs are now sealed
  under your personal key, same as chats: the database and disk alone reveal nothing.
- **Recovery key as a file** — the recovery-key window now offers "Download file"
  alongside copy, so the key lands somewhere more durable than a clipboard.
- **Admin password reset** — admins can issue a temporary password when someone is
  locked out. By design it can't unlock their encrypted chats (those are lost
  without the recovery key — that's the privacy guarantee); fresh keys are issued
  at their next login.
- Security hardening: the encryption key inside your session cookie is itself
  sealed now. Everyone gets logged out once by this release.

## v1.6.0 — 2026-07-11

- **Export answers and chats** — hover any answer for PDF / MD buttons (the header
  has the same pair for the whole chat): PDF opens your browser's save-as-PDF with
  a clean paper layout (charts included), MD downloads faithful Markdown. Slide
  decks export as a handout — one slide per page, straight from the deck's own
  PDF button.
- **"Make me a PDF"** — the assistant can now produce real documents: ask for a
  PDF ("make me a PDF with the packing list") and a nicely typeset file appears
  as a download chip in the answer.
- **Private chats (encryption at rest)** — server-saved chats are now encrypted
  with a key only you hold: whoever gets the database — the admin included —
  sees ciphertext. You get a one-time **recovery key** at your next login: it's
  the only way back in if you forget your password (changing your password
  normally keeps everything). Password change and recovery live in Settings →
  Account and "Forgot your password?" on the login screen.

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
