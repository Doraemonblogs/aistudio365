#!/usr/bin/env bash
# Installs the scan-to-pay cashier: static files, nginx /cashier/ route, payment channels.
# Run on the server from the uploaded cashier/ folder. Safe to re-run; QR images already in
# /var/www/aistudio365-cashier/qr are kept unless this folder ships replacements.
set -euo pipefail
KIT=$(cd "$(dirname "$0")" && pwd)
WEB=/var/www/aistudio365-cashier
SITE_CONF=/etc/nginx/sites-available/aistudio365

mkdir -p "$WEB/qr"
install -m 644 "$KIT/index.html" "$WEB/index.html"
for f in "$KIT"/qr/*.png "$KIT"/qr/*.jpg "$KIT"/qr/*.webp; do [ -f "$f" ] && install -m 644 "$f" "$WEB/qr/"; done
echo "cashier files:"; ls -l "$WEB" "$WEB/qr"

if ! grep -q 'location = /cashier/submit.php' "$SITE_CONF"; then
  cp "$SITE_CONF" "/root/backups/nginx-aistudio365-$(date +%Y%m%d-%H%M%S).conf"
  python3 - "$SITE_CONF" <<'PY'
import sys
path = sys.argv[1]
text = open(path, encoding="utf-8").read()
block = """    # Scan-to-pay cashier (static). The 易支付 channels redirect buyers to /cashier/submit.php.
    location = /cashier/submit.php {
        alias /var/www/aistudio365-cashier/index.html;
        default_type text/html;
        add_header Cache-Control "no-store" always;
        add_header X-Robots-Tag "noindex, nofollow" always;
    }
    location /cashier/ {
        alias /var/www/aistudio365-cashier/;
        add_header Cache-Control "no-cache" always;
        add_header X-Robots-Tag "noindex, nofollow" always;
    }

"""
marker = "    location / {"
if text.count(marker) < 1:
    sys.exit("could not find 'location / {' in site config")
open(path, "w", encoding="utf-8").write(text.replace(marker, block + marker, 1))
PY
  if ! nginx -t; then
    cp "$(ls -t /root/backups/nginx-aistudio365-*.conf | head -1)" "$SITE_CONF"
    echo "nginx test failed; site config restored" >&2; exit 1
  fi
  systemctl reload nginx
  echo "nginx: /cashier/ route added"
else
  echo "nginx: /cashier/ route already present"
fi

cp /opt/dujiao-next/data/db/dujiao.db "/root/backups/dujiao-before-cashier-$(date +%Y%m%d-%H%M%S).db"
python3 "$KIT/setup_db.py"
docker exec dujiaonext-redis sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning --scan --pattern "*public:config*" | xargs -r redis-cli -a "$REDIS_PASSWORD" --no-auth-warning del' >/dev/null
echo "public config cache cleared"
