#!/usr/bin/env bash
# Local dev: hot-reload backend + Vite dev server (attached). Ctrl-C to stop.
set -euo pipefail
cd "$(dirname "$0")"

[ -f .env ] || cp .env.example .env

echo "→ starting dev stack (backend :8000 reload, frontend :5173)…"
exec docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build "$@"
