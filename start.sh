#!/usr/bin/env bash
# Prod / VPS: the one command. After `git pull`, run `./start.sh`.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "! created .env from .env.example."
  echo "  For Ollama Cloud set OLLAMA_API_KEY (and OLLAMA__BASE_URL=https://ollama.com/v1) in .env."
fi

echo "→ building and starting silly-chat…"
docker compose up -d --build

echo "✓ silly-chat is up → http://localhost:8080"
echo "  logs: ./logs.sh   stop: ./stop.sh"
