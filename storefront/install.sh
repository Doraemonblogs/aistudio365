#!/usr/bin/env bash
# Installs the storefront tweaks and clears the cached public config so they apply at once.
set -euo pipefail
KIT=$(cd "$(dirname "$0")" && pwd)
python3 "$KIT/install.py"
docker exec dujiaonext-redis sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning --scan --pattern "*public:config*" | xargs -r redis-cli -a "$REDIS_PASSWORD" --no-auth-warning del' >/dev/null
curl -s http://127.0.0.1:18081/api/v1/public/config \
  | python3 -c 'import json,sys; d=json.load(sys.stdin)["data"]; print("live scripts:", [(s["name"], s["enabled"], len(s["code"])) for s in d.get("scripts", [])])'
