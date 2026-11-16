#!/bin/sh
# Nightly database and file backup. Run from cron on the server, for example:
#   15 2 * * * cd /opt/smart_reply/infra && ./backup/backup.sh >> /var/log/smart-reply-backup.log 2>&1
# Copy the backups folder to another provider (rclone, S3) — a backup on the same disk is not enough.
set -eu
cd "$(dirname "$0")/.."
STAMP=$(date +%Y-%m-%d_%H%M)
OUT=./backups
mkdir -p "$OUT"
docker compose exec -T postgres pg_dump -U smart -d smart_reply -Fc > "$OUT/db_$STAMP.dump"
docker compose run --rm -v "$(pwd)/$OUT:/out" --entrypoint sh api -c "tar -czf /out/files_$STAMP.tgz -C /app/backend storage" || true
find "$OUT" -type f -mtime +30 -delete
echo "Backup done: $STAMP"
