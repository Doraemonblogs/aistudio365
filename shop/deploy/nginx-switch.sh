#!/usr/bin/env bash
# Runs on the server. Points aistudio365.duckdns.org at the new shop (127.0.0.1:18082) or back at
# Dujiao-Next (127.0.0.1:18081) by changing proxy_pass in the nginx site, then reloads nginx.
# The previous file is saved under /root first and restored if nginx rejects the new one.
#   bash nginx-switch.sh shop      # serve the new shop
#   bash nginx-switch.sh dujiao    # roll back to Dujiao-Next
set -euo pipefail

SITE=/etc/nginx/sites-available/aistudio365
case "${1:-}" in
  shop) from=18081 to=18082 ;;
  dujiao) from=18082 to=18081 ;;
  *) echo "usage: $0 shop|dujiao" >&2; exit 1 ;;
esac

if grep -q "proxy_pass http://127.0.0.1:$to;" "$SITE"; then
  echo "already serving 127.0.0.1:$to"
  exit 0
fi

backup="/root/nginx-aistudio365.$(date +%Y%m%d-%H%M%S).bak"
cp "$SITE" "$backup"
sed -i "s#proxy_pass http://127.0.0.1:$from;#proxy_pass http://127.0.0.1:$to;#" "$SITE"

if ! grep -q "proxy_pass http://127.0.0.1:$to;" "$SITE" || ! nginx -t; then
  cp "$backup" "$SITE"
  echo "could not switch; $SITE restored from $backup" >&2
  exit 1
fi
systemctl reload nginx
echo "aistudio365.duckdns.org now goes to 127.0.0.1:$to (previous file: $backup)"
