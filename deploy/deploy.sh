#!/usr/bin/env bash
# Deploys (or upgrades) Dujiao-Next in /opt/dujiao-next and serves it at $DOMAIN through
# nginx + Let's Encrypt. Run on the server from the uploaded deploy/ folder.
# Safe to re-run: secrets are generated once into /opt/dujiao-next/.env and reused, and the
# nginx site and certificate are only created when missing. Changing TAG upgrades the app.
set -euo pipefail

DOMAIN=aistudio365.duckdns.org
TAG=v1.5.2
APP_PORT=18081
DIR=/opt/dujiao-next
SITE=aistudio365
KIT=$(cd "$(dirname "$0")" && pwd)

mkdir -p "$DIR/config" "$DIR/data/db" "$DIR/data/uploads" "$DIR/data/logs" "$DIR/data/redis"

if [ ! -f "$DIR/.env" ]; then
  hex() { openssl rand -hex "$1"; }
  ( umask 077
    cat > "$DIR/.env" <<EOF
TAG=$TAG
TZ=Asia/Shanghai
APP_PORT=$APP_PORT
DJ_DEFAULT_ADMIN_USERNAME=doraemon
DJ_DEFAULT_ADMIN_PASSWORD=Dj$(hex 12)A9
REDIS_PASSWORD=$(hex 24)
APP_SECRET_KEY=$(hex 32)
JWT_SECRET=$(hex 32)
USER_JWT_SECRET=$(hex 32)
ADMIN_PATH=/dj-$(hex 10)
EOF
  )
  echo "generated new secrets in $DIR/.env"
else
  sed -i "s/^TAG=.*/TAG=$TAG/" "$DIR/.env"
fi

set -a; . "$DIR/.env"; set +a

( umask 077
  sed -e "s|__APP_SECRET_KEY__|$APP_SECRET_KEY|" \
      -e "s|__JWT_SECRET__|$JWT_SECRET|" \
      -e "s|__USER_JWT_SECRET__|$USER_JWT_SECRET|" \
      -e "s|__REDIS_PASSWORD__|$REDIS_PASSWORD|g" \
      -e "s|__ADMIN_PATH__|$ADMIN_PATH|" \
      "$KIT/config.yml.tpl" > "$DIR/config/config.yml"
)
if grep -q '__[A-Z_]*__' "$DIR/config/config.yml"; then
  echo "unfilled placeholder in config.yml" >&2; exit 1
fi
cp "$KIT/docker-compose.sqlite.yml" "$DIR/"

cd "$DIR"
docker compose --env-file .env -f docker-compose.sqlite.yml pull -q
docker compose --env-file .env -f docker-compose.sqlite.yml up -d

echo -n "waiting for /health"
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$APP_PORT/health" >/dev/null 2>&1; then echo " ok"; break; fi
  echo -n "."; sleep 2
  if [ "$i" = 60 ]; then echo " timed out" >&2; docker logs --tail 50 dujiao-next >&2; exit 1; fi
done

if [ ! -f "/etc/nginx/sites-available/$SITE" ]; then
  cp "$KIT/nginx-aistudio365.conf" "/etc/nginx/sites-available/$SITE"
  ln -sf "/etc/nginx/sites-available/$SITE" "/etc/nginx/sites-enabled/$SITE"
  if ! nginx -t; then
    rm -f "/etc/nginx/sites-enabled/$SITE" "/etc/nginx/sites-available/$SITE"
    echo "nginx config test failed; site removed again" >&2; exit 1
  fi
  systemctl reload nginx
fi

if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  certbot --nginx -d "$DOMAIN" --non-interactive --redirect
fi

echo
echo "shop:  https://$DOMAIN/"
echo "admin: https://$DOMAIN$ADMIN_PATH"
echo "admin user: $DJ_DEFAULT_ADMIN_USERNAME (password: DJ_DEFAULT_ADMIN_PASSWORD in $DIR/.env)"
