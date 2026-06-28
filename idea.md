# Private LLM Frontend — Design Notes

A self-hosted, casual-friendly chat product for friends & family, running against a
hosted LLM provider that exposes an OpenAI-compatible API. The goal is the opposite of
OpenWebUI: hide all the machinery, expose a single text box, and make the _right thing_
happen underneath.

---

## Guiding principle

Casuals should never see that there are multiple models or tools. One input box. They
paste an image, ask a question, drop a constraint — and the system routes, searches,
verifies, and renders the result. No model picker, no settings page, no toggles they
don't understand. The only control they ever touch is a Search / Chat mode pill.

OpenWebUI fails for non-technical users because it leads with the cockpit. This leads
with the answer.

---

## Architecture overview

Orchestrator–worker (supervisor / sub-agent) topology with a structured-rendering UI layer.

```
Frontend  ↔  Agent backend  ↔  LLM provider (tool-capable models)
                             +  SearXNG instance (reachable)
                             +  Vision-capable model endpoint
```

- **Orchestrator (manager):** a _capable_ tool-calling model. Routes, delegates,
  collects results, and emits the final structured UI. This is the one place to spend
  on model quality — routing/decomposition is the hardest skill and the cheap models
  are weakest there.
- **Sub-agents (workers):** cheap, narrow, single-purpose. Each has a tight prompt and
  a small toolset. They return **structured data**, not UI.
- **Economics insight:** capable manager, cheap workers — the inverse of the first instinct.

A "respond directly" fast path is one of the orchestrator's tool options, so trivial
inputs ("hi") don't pay the full multi-agent latency tax (4–8 round trips for a meaty query).

---

## Backend: Python / FastAPI

Python is chosen deliberately over Node once real agentic tool-use is on the table:

- The agent loop (model → tool_calls → execute → feed back → repeat) is the whole backend.
- Python's agent/tool ecosystem is more mature and is what model providers test against first.
- **Pydantic AI** is the pick over LangGraph for this scope: typed, light, model-agnostic,
  does agents-as-tools, and — crucially — enforces **structured outputs**, which the
  JSON-driven UI depends on. LangGraph only earns its complexity with explicit multi-step
  graphs/state machines, which this doesn't need.
- Tools are just Python functions (`def web_search(query: str) -> list[Result]`), exposed
  to the model with minimal ceremony.

Any OpenAI-compatible provider points straight at this. Filter to **tool-capable models
only** so the agentic loop is reliable across whatever mix of models the provider offers.

---

## Tools

### Web search — SearXNG

- A SearXNG instance with its JSON API enabled (`json` must be added to `formats` in
  `settings.yml` — it's off by default — then restart).
- The backend queries it: `<searxng>/search?q=...&format=json`. Only requirement: the
  backend can reach it.
- No external search API, no keys, no per-query cost.
- Text search and image search (`categories=images`) are both available.

### Vision — sidecar model

- Most text models are text-only, so vision is a separate model the system routes to
  (any vision-capable endpoint — provider-hosted or self-hosted).
- Two roles:
  1. **User-uploaded images** — describe / answer, invisibly (fires regardless of mode).
  2. **Verifying search results** — the agent calls vision _on candidate images_ to enforce
     visual constraints metadata can't.

---

## Extensibility: tools, skills, self-improvement

Three separate planes. The thing that keeps them from fighting the casual-friendly goal:
**capability is admin-gated; casuals consume, they don't extend.** Users get a great chat
experience; adding tools/skills and approving improvements are admin acts. This is the
safety spine — it's what lets you say yes to extensibility instead of fearing it.

### Tools — capabilities (verbs the model can do)

A tool is a registered function: name, description, input schema, handler. Expandability
means a **tool registry** where tools are plugins — adding one is dropping in a registered
function, never editing the core loop. Web search and vision are just the first two entries;
calculator, calendar, RSS, home-automation, etc. all slot in the same way. The framework
already models tools this way, so this works _with_ it.

Three tiers of how dynamically tools can be added, increasingly powerful and dangerous:

1. **Code-level** — add a function, redeploy. Simplest, safest. Fine for v1.
2. **Config-level** — tools declared declaratively (OpenAPI spec, **MCP server URL**) loaded
   without redeploy. MCP is the natural fit: an MCP server _is_ a portable tool bundle, so
   "admin pastes an MCP server URL → its tools become available" is a powerful expandability
   story with no per-integration code.
3. **Runtime / user-defined** — users define tools. Dangerous; gate hard (see safety).

Tools that _do_ things (write/act, not just read) want explicit allowlisting.

### Skills — competence (knowing how to do a task well)

Distinct from tools. A skill is **packaged instruction + context that makes the model better
at a recurring task**: a prompt template, a workflow, reference material, a preferred tool
sequence. "Summarize a paper this specific way," "do my standup format." A skill may
orchestrate several tools in a known pattern.

Key distinction to hold: **tools add capabilities, skills add competence.** Expandability for
skills is a _content_ problem, not a code problem — a skill is a document/template in a registry,
selectable or auto-triggered. That makes skills the **safe** extensibility surface: adding one is
adding instructions, not executing new code. Good place to let more people contribute.

### Self-improvement — two distinct scopes

These get conflated but shouldn't be: one is per-user and automatic, the other is cross-user
and admin-gated. Different scope, different gate, different mechanism.

#### 1. Per-user memory (the feature casuals actually feel)

Memory as a **tool the AI uses live, in-conversation**. A `remember` tool plus a recall path:
the user corrects a hallucination or states a durable preference → the model calls
`remember(...)` → it's written to _that user's_ memory store → on future turns, relevant
memories are pulled into context so the mistake/preference is respected. This is what makes the
thing feel like it learns _you_.

Two flavours of the same mechanism:

- **Fact memory** — a correction. "In game X, mechanic Y works like Z, not what you said."
  Recalled when the topic recurs.
- **Behavioural memory** — a preference. "When I ask for food I don't mean Asian." Shapes how
  future requests are interpreted; recalled more broadly.

**Memory is coupled to non-private mode — same switch.** Memory requires persistence, and
persistence _is_ the non-private opt-in from the privacy design. So:

- Private/ephemeral → no memory, by definition. Honest: "I won't remember this."
- Non-private → memory tool active; the AI can write and recall.

Memory isn't a separate setting to explain — it's _what non-private mode gives you_. "Turn on
saving → I start learning your preferences." One concept, not two. It's per-user and needs **no
admin approval**, because it only affects that one user.

Design points with teeth:

- **Recall is the hard 80%, not writing.** Writing is trivial; pulling the _right_ memories into
  context without bloat or misses is the work. At family scale, **just include all of a user's
  memories** — nobody accumulates enough to bust the window. Add embedding/semantic retrieval
  only when a memory list actually gets big. Don't build a vector DB for 5 users on day one.
- **The model must know when to call `remember`** — on corrections and stated preferences, _not_
  every passing comment. Casuals won't say "remember this"; the model has to notice "actually
  it's X not Y" is worth persisting. Tuning this trigger (eager enough to help, restrained enough
  not to memorize noise) is the real work.
- **Memory must be visible and editable — non-negotiable.** A "here's what I remember about you"
  view the user can read, edit, delete. Hidden memory is creepy; a visible list is the trust
  mechanism _and_ the magic ("✓ prefers non-Asian food" — they see what happened). Per-user view,
  per-user delete.
- **Explicit beats inferred, to start.** Lean on clear signals (corrections, "I don't like…",
  "always…", "remember that…"). Aggressive inference ("ordered pizza once → likes Italian")
  produces wrong, confusing memories. Conservative writing + visible list + easy delete is the
  trustworthy combination.

#### 2. Global improvement (cross-user, admin-gated)

When a correction should improve the product for _everyone_ — a new skill, a global prompt fix —
that's not personal memory, it affects all users, so admin approval belongs here. The system may
_suggest_ (a skill distilled from a repeated pattern, a tool it wishes it had, a prompt fix),
surfaced to admin, applied **only on approval**. Never autonomous self-modification: an agent that
writes and runs its own tools/prompts can do arbitrary things and its failure modes are hard to
bound. Proposal → admin approval → live.

### Safety spine (applies to all three)

- Capability is **admin-gated**; casuals consume, don't extend.
- Acting tools (vs read-only) require explicit **allowlisting**.
- User-defined tools, if ever allowed, run **sandboxed** and can't touch host infra.
- **Per-user memory** needs no admin gate (affects only that user) but must be **visible and
  user-editable**, and only active in non-private mode.
- **Global improvement** (cross-user) is **proposal → admin approval → live**, never autonomous.

---

## Why agentic matters — the worked example

> "Find me a picture of Angelina Jolie wearing a hat."

A search-then-inject pipeline can't do this. Metadata lies or is silent: a hat photo may be
titled "Cannes 2019" with no mention of headwear, and "Jolie hat" titles are often clickbait
with no hat. "Wearing a hat" is a **visual predicate**, not a search term.

The agentic flow:

```
image_search("Angelina Jolie hat")  → candidate image URLs + metadata
  → for top candidates: vision_verify("is she wearing a hat?")  → yes/no each
  → keep only confirmed matches
  → return verified results
```

This is tool-chaining: output of one tool (URLs) feeds another (vision), manager orchestrates.

**Division of labour:** let the _search query_ carry identity ("who" = Angelina Jolie — vision
models are reluctant to name real people), and let _vision_ verify only the attribute ("hat:
yes/no" — which it does reliably without the identification reluctance).

**Practical caps:** this is the query type that actually spends the model budget (many vision
calls). Cap candidates checked, or verify sequentially and stop at ~3 confirmed hits.

---

## Modes — search-centric

Two modes, the mode is the toggle (not a hidden agentic guess):

- **Search (default):** factual lookups are grounded in real results. With tool-capable
  models + a real loop, the agent itself decides to search; "search-centric" becomes a
  system-prompt bias ("prefer searching for factual questions") rather than a forced code path.
- **Chat (opt-in):** skip search — poems, brainstorming, explanation, where search is noise.

Search-default matches what casuals actually ask (open hours, "is this true", "what's the deal
with X") and grounding kills hallucination — which is what makes casuals lose trust and stop
using it. The Chat pill is the relief valve. One control, two pills, Search lit by default.

---

## Privacy & history

Ephemeral by default; persistence is opt-in and tiered:

- **Ephemeral (default):** conversation lives only in client state. Refresh = gone. Nothing
  hits the server. Advertised as "private chat — nothing is saved."
- **Local (their choice):** **IndexedDB** in their browser (Dexie wrapper). Structured data,
  big quotas, async — appropriate where localStorage isn't. History lives on _their_ machine;
  the server never sees it. Per-device by nature; server sync is the only cross-device fix.
- **Server sync (explicit opt-in):** only then does it write to SQLite. Heaviest option,
  deliberate.

**Memory is the payoff of non-private mode.** The same persistence opt-in that enables server
storage is what unlocks per-user memory (see Self-improvement → Per-user memory). Private mode =
nothing stored, nothing remembered; non-private = the AI learns your corrections and preferences.
One switch, framed as "turn on saving → I start learning you."

Consequence: the server schema barely needs a conversations table for v1. Ship ephemeral +
IndexedDB, add server sync later.

---

## Proactive / scheduled tasks

> "Check this website next week — if X is on sale, remind me."

This breaks the core assumption everything else rests on: until now nothing runs without a
user present (pure request-response). A reminder like this needs the system to **act on its
own, later, with no one in the chat**. That's a real new subsystem — the first headless part.
Non-private only (it's durable and user-tied). Treat it as a **distinct later phase**, not a
v1 freebie.

### Three new pieces

1. **Task store** — persisted (SQLite): "on date D (or every interval), run check; if condition
   C, notify user U." Survives restarts.
2. **Scheduler / worker** — wakes on a schedule, finds due tasks, runs them with no user in the
   loop. The "check the website" step _reuses the existing agent machinery_ (just an agent run
   with web tools) — but triggered by time, not a person. First headless component.
3. **Delivery channel** — how a result reaches a user who isn't in the app. The hard part,
   because the product is a browser app and a closed tab can't be reached. Needs an out-of-band
   path → **Web Push** (below).

### Delivery — Web Push

Chosen for self-containment: no email server, no third-party service, no bot. Web standards
hosted by the app itself.

- Mechanism: a **service worker** registered independent of any tab. Server sends a push → the
  browser vendor's push service wakes the service worker in the background → it shows a native
  OS notification. **Works with the site closed** — tab shut, browser minimized, nothing open.
- What's only-while-open is the _permission grant_ (one-time opt-in), not delivery.
- **iOS caveat:** Web Push on iPhone requires the site be **installed as a PWA** ("Add to Home
  Screen"). Plain Safari tab won't background-push. One-time hoop, then it works like native.

### Push addresses devices, not people — so fan out

A push subscription is unique to **one browser on one device**. Grant on PC → only the PC has a
subscription → nothing reaches the phone in the car. There is no user-level push identity.

So the delivery layer bridges endpoint → person:

- The **task and its result belong to the user** (task store keyed by user U).
- A user may **register push on multiple devices** (PC _and_ phone); store every subscription
  object against user U.
- When a notification fires, **fan out to all of that user's subscriptions** — PC and phone buzz
  together; whichever you're near, you get it.

Practical nudge: when a user sets a reminder-style task, that's the moment to prompt "enable
notifications on this device?" — and specifically encourage the **phone**, since that's the
device with them when the reminder actually fires. (Email stays a possible future companion as
the one device-independent channel, but Web Push is the scope for now.)

### Bounding (headless agents need limits)

An unattended scheduled agent calling web + LLM tools on a loop is a budget/footgun risk
precisely because no one's watching it run:

- max retries; task **expiry** ("give up after 2 weeks");
- cap on how often a recurring check runs;
- ceiling on active scheduled tasks per user.

### One-shot vs recurring

- **One-shot:** "check next week, once." Simple, no stop condition.
- **Recurring:** "check every Friday until on sale." More useful for sale-watching but needs a
  **stop condition** (when to give up). This distinction mainly shapes the task model.

### Build order

Task store + scheduler + **in-app delivery** first (fully functional, just passive — "while you
were gone: X went on sale" on next visit), then **Web Push** on top. Lets you build the hard
headless half before the notification plumbing.

---

## JSON-driven UI (generative UI)

The frontend has a fixed component library; the model emits a **validated block array** that
selects and fills components. This is what turns a chat box into a product.

- **Fixed component vocabulary** as a discriminated union, e.g.:
  - `{type: "text", markdown}`
  - `{type: "table", columns, rows}`
  - `{type: "gallery", images}`
  - `{type: "chart", kind, data}`
  - `{type: "code", language, content}`
- **Constrain or it breaks:** enforce via JSON-schema / grammar-constrained decoding where
  available, plus Pydantic validation + repair pass. Pydantic AI's typed structured output is
  exactly this — another reason it's the framework pick.
- **Data vs presentation:** sub-agents return structured _data_; the orchestrator's final step
  decides _presentation_ (wraps data in blocks). Workers never emit UI. Re-skin without touching
  agent logic.

The **component schema is the product's vocabulary** — lock it early; changing it later is churn.

---

## Streaming protocol

Stream the **orchestrator only**, not the agents. Agents run "dark" — their tokens are
internal noise (often tool-call JSON). But stream agent **status** to fill dead air during the
4–8 round trips: "Searching the web…", "Found 8 images, checking them…", "Verifying hats…".
Heartbeat, not tokens.

Smart component streaming — two cases:

- **Text blocks:** stream token-by-token, live typing, no skeleton.
- **Structured blocks (table/gallery/chart):** can't render partially. Lifecycle is
  skeleton → fill. Render a **type-specific** skeleton (table-shaped shimmer, gallery tiles)
  the moment the block opens, swap in real data when complete. A type-specific skeleton tells
  the user what's coming — feels intentional, not a generic spinner.

**Critical schema rule:** the block's `type` must arrive _before_ its `data`. Emit
`{type:"table"}` first, fill `rows` after — otherwise you can't show a typed skeleton, just a
spinner-then-pop. This is a backend prompt/schema decision that directly enables the frontend UX.

The transport is a sequence of typed events (SSE named events or websocket with a type field),
multiplexing several event kinds down one channel:

```
text_delta              → append to current text block (live typing)
block_start {type:"gallery"}  → render type-specific skeleton
block_data {...}        → fill the block, remove skeleton
agent_status {...}      → update the working heartbeat
done
```

The frontend is a small state machine dispatching on event type. This streaming-event →
progressive-UI layer is the part that's _actually engineering_ (the agent loops are mostly
framework-handled) and the part that makes casuals say "oh, this is nice."

---

## Auth (settled, low-priority)

Self-contained, no external IdP / SSO. Self-registration with manual approval:
`users` table with a `status` column (`pending` → `approved`), login gates on `approved`, one
admin page lists pending users with an approve button. Optional Discord/Joy webhook on new
`pending` row. Better Auth (credentials-only) or a hand-rolled signed-cookie session — both
SQLite-native. Invite-only is the more locked-down alternative when the app is internet-facing.

---

## Stack summary

| Layer           | Choice                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------ |
| Frontend        | Any SPA framework (React / Vue / Svelte) + fixed component registry + event-driven state machine |
| Agent backend   | Python / FastAPI                                                                                 |
| Agent framework | Pydantic AI (loop + typed structured output)                                                     |
| Models          | Tool-capable only; capable orchestrator, cheap workers                                           |
| Web search      | SearXNG with JSON API enabled, reachable by the backend                                          |
| Vision          | Sidecar vision-capable model (any endpoint)                                                      |
| Persistence     | Ephemeral default → IndexedDB (Dexie) → SQLite (opt-in sync)                                     |
| Transport       | SSE / websocket, typed multiplexed events                                                        |
| Extensibility   | Tool registry (+ MCP); skill registry (content); admin-gated                                     |
| Improvement     | Per-user memory (non-private, visible/editable) + admin-gated global                             |
| Proactive tasks | Task store + headless scheduler + Web Push (fan out to all user devices)                         |

---

## Things to lock before building

1. **Component/block vocabulary** — the product's UI language; expensive to change later.
2. **The event protocol** — event types + block lifecycle (start→skeleton, data→fill), and
   prompting the orchestrator to emit type-before-data so progressive rendering works.

Model selection is _not_ on this list — it's runtime config, not architecture. The admin sets
a default orchestrator model and may expose the allowed list for users to pick from (one as the
default). Models can be swapped anytime without a rebuild — nothing is married to a specific one.
The only constraint: the orchestrator role must use a tool-capable model, so that list is filtered
to tool-capable models. Which specific one is just a default value.
