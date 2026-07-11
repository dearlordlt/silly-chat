# silly-chat — project rules

Self-hosted agentic chat for friends & family. Public repo — never commit secrets
(`.env`, keys, private IPs).

## Versioning & docs (MANDATORY, feature-level)

`CHANGELOG.md` is the single source of truth for the version: the topmost `## vX.Y.Z`
heading IS the current version. `/api/meta`, the About/Help UI, and the orchestrator's
self-knowledge (genome) all derive from `CHANGELOG.md` + `HELP.md` — never hardcode a
version or feature list anywhere else.

**Deploy = release.** Every deploy to the VPS is its own version, tagged at deploy
time — never deploy twice under the same number:

1. Features since the last deploy → bump the MINOR (`1.7.0`); fixes only → bump the
   PATCH (`1.6.1`). Finalize the `## vX.Y.Z — YYYY-MM-DD` heading in `CHANGELOG.md`
   before deploying (feature bullets for minors; one short fixes bullet for patches).
2. Update `HELP.md` if the feature is user-facing (add/adjust its `##` section).
3. Deploy flow: commit → `git tag vX.Y.Z && git push --tags` → ship that exact
   commit to the VPS. Local dev may run unreleased work; prod only runs tagged code.

A feature is not done until CHANGELOG.md and HELP.md reflect it.

Dev gotcha: the dockerized dev backend bind-mounts CHANGELOG.md/HELP.md as single
files — editors replace the inode, so the container keeps seeing the old content.
After editing them, `docker compose restart backend` (prod bakes them into the image).

## Design

`design/silly-chat-design.html` (26 frames) + `design/TOKENS.md` are canonical. New UI
must match the token formulas/metrics and work in both showcase themes
(Frigg·Glow light, Bifröst·Aurora dark) and on mobile (390px).

## SSOT

One place per behavior knob: prompts under `backend/app/prompts/` (registry), runtime
config in `config.toml` + `backend/app/config.py`, wire contract in
`backend/app/schema/` (frontend `types/contract.ts` is GENERATED — run
`uv run python scripts/gen_ts_types.py` + `npm run gen:types` after schema changes).
