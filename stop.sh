#!/usr/bin/env bash
# Stop the running stack. Compose finds the containers by project name, so this works
# whether you started prod (./start.sh) or dev — no need to name the compose files.
# (dev.sh runs attached, so Ctrl-C also stops it.) Your data lives in a named volume
# and survives this; add `-v` to also wipe it.
set -euo pipefail
cd "$(dirname "$0")"
exec docker compose down "$@"
