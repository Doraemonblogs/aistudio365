#!/usr/bin/env bash
# Stops the app, backs up the database, imports catalog.json, restarts the app and clears
# the cached public config so the new site name and announcement show at once.
set -euo pipefail
KIT=$(cd "$(dirname "$0")" && pwd)
cd /opt/dujiao-next
COMPOSE="docker compose --env-file .env -f docker-compose.sqlite.yml"

$COMPOSE stop dujiao-next
mkdir -p /root/backups
B=/root/backups/dujiao-before-import-$(date +%Y%m%d-%H%M%S).db
cp data/db/dujiao.db "$B"
for f in data/db/dujiao.db-wal data/db/dujiao.db-shm; do [ -f "$f" ] && cp "$f" "$B${f##*.db}"; done
echo "db backup: $B"

if ! python3 "$KIT/import_catalog.py" "$KIT/catalog.json"; then
  echo "import failed; database left as it was (transaction rolled back)" >&2
  $COMPOSE start dujiao-next
  exit 1
fi

$COMPOSE start dujiao-next
docker exec dujiaonext-redis sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning --scan --pattern "*public:config*" | xargs -r redis-cli -a "$REDIS_PASSWORD" --no-auth-warning del'

for i in $(seq 1 30); do
  curl -fsS http://127.0.0.1:18081/health >/dev/null 2>&1 && { echo "app healthy"; exit 0; }
  sleep 2
done
echo "app did not become healthy" >&2; docker logs --tail 40 dujiao-next >&2; exit 1
