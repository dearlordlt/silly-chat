# silly-chat — project rules

Self-hosted agentic chat for friends & family. Public repo — never commit secrets
(`.env`, keys, private IPs).

## Versioning & docs (MANDATORY, feature-level)

`CHANGELOG.md` is the single source of truth for the version: the topmost `## vX.Y.Z`
heading IS the current version. `/api/meta`, the About/Help UI, and the orchestrator's
self-knowledge (genome) all derive from `CHANGELOG.md` + `HELP.md` — never hardcode a
version or feature list anywhere else.

For EVERY feature-level change (new capability, changed behavior a user would notice —
not bug-level fixes):

1. Add a bullet under the current top version heading in `CHANGELOG.md` while it is
   unreleased, or start a new `## vX.Y.Z — YYYY-MM-DD` heading on release.
2. Update `HELP.md` if the feature is user-facing (add/adjust its `##` section).
3. On release ("tag it"): bump the heading, then `git tag vX.Y.Z && git push --tags`.

A feature is not done until CHANGELOG.md and HELP.md reflect it.

## Design

`design/silly-chat-design.html` (26 frames) + `design/TOKENS.md` are canonical. New UI
must match the token formulas/metrics and work in both showcase themes
(Frigg·Glow light, Bifröst·Aurora dark) and on mobile (390px).

## SSOT

One place per behavior knob: prompts under `backend/app/prompts/` (registry), runtime
config in `config.toml` + `backend/app/config.py`, wire contract in
`backend/app/schema/` (frontend `types/contract.ts` is GENERATED — run
`uv run python scripts/gen_ts_types.py` + `npm run gen:types` after schema changes).
