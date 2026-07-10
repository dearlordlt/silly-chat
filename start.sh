#!/usr/bin/env bash
# Prod / VPS: the one command. After `git pull`, run `./start.sh`.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "! created .env from .env.example."
  echo "  For Ollama Cloud set OLLAMA_API_KEY (and OLLAMA__BASE_URL=https://ollama.com/v1) in .env."
fi

# --- session secret: never run with the known dev default ---------------------
if ! grep -q '^SESSION_SECRET=' .env || grep -q '^SESSION_SECRET=dev-insecure-change-me' .env || grep -q '^SESSION_SECRET=$' .env; then
  SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
  if grep -q '^SESSION_SECRET=' .env; then
    sed -i "s/^SESSION_SECRET=.*/SESSION_SECRET=${SECRET}/" .env
  else
    printf '\nSESSION_SECRET=%s\n' "${SECRET}" >> .env
  fi
  echo "! generated a strong SESSION_SECRET in .env (existing logins are signed out)."
fi

# --- compose profiles from .env ------------------------------------------------
# DOMAIN=…                        → public (Caddy on 80/443 with automatic HTTPS)
# OLLAMA__EMBED_BASE_URL=…//ollama:… → embed (local CPU appliance for embeddings)
PROFILES=""
DOMAIN=$(grep -E '^DOMAIN=' .env | cut -d= -f2- || true)
if [ -n "${DOMAIN}" ]; then
  PROFILES="public"
  echo "→ public mode: Caddy will serve https://${DOMAIN}"
fi
if grep -qE '^OLLAMA__EMBED_BASE_URL=.*//ollama:' .env; then
  PROFILES="${PROFILES:+${PROFILES},}embed"
  echo "→ embed appliance enabled (local CPU embeddings)"
fi
export COMPOSE_PROFILES="${PROFILES}"

echo "→ building and starting silly-chat…"
docker compose up -d --build

# --- make sure the embedding model is present in the appliance -----------------
if [[ ",${PROFILES}," == *",embed,"* ]]; then
  EMBED_MODEL=$(grep -E '^embed *= *"' config.toml | sed 's/.*"\(.*\)".*/\1/')
  echo "→ ensuring embedding model '${EMBED_MODEL}' is pulled…"
  docker compose exec ollama ollama pull "${EMBED_MODEL}" || \
    echo "! could not pull ${EMBED_MODEL} — run: docker compose exec ollama ollama pull ${EMBED_MODEL}"
fi

echo "✓ silly-chat is up → ${DOMAIN:+https://${DOMAIN} and }http://localhost:8080"
echo "  logs: ./logs.sh   stop: ./stop.sh   backup: ./backup.sh"
