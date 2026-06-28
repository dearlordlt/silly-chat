#!/usr/bin/env bash
# Tail logs. Optional service name: ./logs.sh backend
set -euo pipefail
cd "$(dirname "$0")"
exec docker compose logs -f "$@"
