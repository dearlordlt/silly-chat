#!/usr/bin/env bash
# Stop everything (prod or dev).
set -euo pipefail
cd "$(dirname "$0")"
exec docker compose -f docker-compose.yml -f docker-compose.dev.yml down "$@"
