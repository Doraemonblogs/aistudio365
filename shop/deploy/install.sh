#!/usr/bin/env bash
# Runs on the server. Installs the release that deploy.cmd unpacked into /opt/aistudio365-shop/src.new,
# builds the image and restarts the shop. The previous release stays in src.prev for a rollback.
#   bash /opt/aistudio365-shop/src.new/deploy/install.sh <revision>
set -euo pipefail

ROOT=/opt/aistudio365-shop
REV=${1:-unknown}
cd "$ROOT"
[ -d src.new ] || { echo "no release in $ROOT/src.new" >&2; exit 1; }

rm -rf src.prev
if [ -d src ]; then mv src src.prev; fi
mv src.new src
find src -name '*.sh' -exec sed -i 's/\r$//' {} +

mkdir -p data
chown -R 1000:1000 data # the container runs as the image's "node" user (uid 1000)
echo "$REV" > REVISION

docker compose -f src/deploy/compose.yml build
docker compose -f src/deploy/compose.yml up -d

for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null http://127.0.0.1:18082/api/shop; then
    docker image prune -f --filter label=app=aistudio365-shop >/dev/null
    echo "aistudio365-shop $REV is up on 127.0.0.1:18082"
    exit 0
  fi
  sleep 2
done
echo "aistudio365-shop did not answer on 127.0.0.1:18082; recent logs:" >&2
docker logs --tail 50 aistudio365-shop >&2
exit 1
