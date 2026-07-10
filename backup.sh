#!/usr/bin/env bash
# Snapshot the data volume (SQLite DB + uploads) into ./backups/, keeping the last 14.
# Uses SQLite's online-backup API so the snapshot is consistent while the app runs.
# Cron example (daily 04:00):  0 4 * * *  cd /path/to/silly-chat && ./backup.sh
set -euo pipefail
cd "$(dirname "$0")"

STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p backups

echo "→ consistent SQLite snapshot…"
docker compose exec -T backend python - <<'PY'
import sqlite3
src = sqlite3.connect("/srv/data/silly.db")
dst = sqlite3.connect("/srv/data/.backup-tmp.db")
src.backup(dst)
dst.close(); src.close()
print("snapshot done")
PY

echo "→ copying data out of the volume…"
docker compose cp backend:/srv/data "backups/data-${STAMP}" >/dev/null
docker compose exec -T backend rm -f /srv/data/.backup-tmp.db

# Ship the snapshot as the DB inside the archive; drop the live (possibly mid-write) file.
mv "backups/data-${STAMP}/.backup-tmp.db" "backups/data-${STAMP}/silly.db"
tar -czf "backups/silly-${STAMP}.tar.gz" -C backups "data-${STAMP}"
rm -rf "backups/data-${STAMP}"

ls -1t backups/silly-*.tar.gz | tail -n +15 | xargs -r rm -f
echo "✓ backups/silly-${STAMP}.tar.gz ($(du -h "backups/silly-${STAMP}.tar.gz" | cut -f1)) — keeping newest 14"
