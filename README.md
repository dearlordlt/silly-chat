# silly-chat

A self-hosted, casual-friendly chat app for friends & family. One text box; the
orchestrator routes, searches, verifies, and renders the answer underneath. Runs against
Ollama (local or Cloud). See [idea.md](idea.md) for the full design.

## Quick start

```bash
cp .env.example .env       # set OLLAMA_API_KEY (use "ollama" for a local daemon)
./start.sh                 # build + run everything → http://localhost:8080
```

On a VPS the whole update flow is:

```bash
git pull && ./start.sh
```

## Scripts

| Script | What it does |
| --- | --- |
| `./start.sh` | Build + run the full stack (prod), detached → http://localhost:8080 |
| `./dev.sh` | Hot-reload dev: backend `:8000` + Vite `:5173` (attached) |
| `./stop.sh` | Stop everything |
| `./logs.sh [service]` | Tail logs |

## Configuration (single source of truth)

- **`config.toml`** — all non-secret config: models, Ollama URL, SearXNG URL, caps.
- **`.env`** — secrets only (`OLLAMA_API_KEY`). Never committed.
- Docker overrides container networking via env (`OLLAMA__BASE_URL`, `SEARCH__SEARXNG_URL`).
- For **Ollama Cloud**: set `OLLAMA_API_KEY` and `OLLAMA__BASE_URL=https://ollama.com/v1` in `.env`.

Prompts live as files under `backend/app/prompts/` (one per behavior); the wire contract
(blocks + stream events) is defined once in `backend/app/schema/` and the frontend's
`src/types/contract.ts` is generated from it.

## Layout

```
backend/    FastAPI + Pydantic AI orchestrator (config.py, prompts/, schema/, agent/)
frontend/   React + Vite + Tailwind (SSE state machine + block renderers)
searxng/    SearXNG config (JSON API enabled)
```

## Verify the core

```bash
cd backend && uv run python scripts/spike.py   # tool-calling + structured output + vision
```
