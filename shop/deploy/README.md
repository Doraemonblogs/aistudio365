# Deploying the shop

The shop runs on `root@23.246.154.136` as the Docker container `aistudio365-shop`, bound to
`127.0.0.1:18082`. The host nginx serves it at https://aistudio365.net (`www.` redirects there) and
still at the older https://aistudio365.duckdns.org, each with its own Let's Encrypt certificate.

The shop moved to its own domain because some mainland networks reset connections to `duckdns.org`
names (the domain in the TLS handshake is blocked; the server's IP stays reachable). The domain is
registered at Squarespace (bought through Google Workspace); its DNS has `A` records for `@` and
`www` pointing at the server, next to the Google Workspace mail records. The shop code has no
domain built in, so the two addresses serve the same shop.

| What | Where on the server |
| --- | --- |
| Current release (source) | `/opt/aistudio365-shop/src`, previous one in `src.prev`, git revision in `REVISION` |
| Data | `/opt/aistudio365-shop/data`: `shop.db`, `uploads/`, `backups/` |
| First admin password | `/opt/aistudio365-shop/admin-password.txt` (root only); delete it after changing the password |
| nginx sites | `/etc/nginx/sites-available/aistudio365-net` (aistudio365.net) and `aistudio365` (duckdns); certbot manages the HTTPS lines |

## Deploy a new version

Commit first: only `git HEAD` is deployed. From the repository on Windows:

```powershell
cmd /c shop\deploy\deploy.cmd
```

It uploads `HEAD:shop`, builds the image on the server (`deploy/compose.yml`), restarts the
container and waits until it answers. Database migrations run on start.

Roll back the code to the previous release:

```powershell
ssh root@23.246.154.136 "cd /opt/aistudio365-shop && docker compose -f src.prev/deploy/compose.yml up -d --build"
```

## nginx

Each site file has one `location /` that proxies to `127.0.0.1:18082`, plus the HTTPS lines certbot
manages; `aistudio365-net` also sends `www.aistudio365.net` to the bare domain. Keep the two
`location /` blocks the same. After editing, run `nginx -t` before `systemctl reload nginx`.

## The earlier Dujiao-Next shop

Dujiao-Next served the domain until 2026-11-05 and was removed from the server that day. Its
containers, images and files are gone. Everything it had (database, uploads, `.env`, config, the
old static cashier with its QR codes, and the nginx file as it was) is in the root-only archive
`/root/dujiao-next-retired-20261104-194522.tar.gz`. Its deploy scripts are in git history before
the commit that removed the `deploy/`, `cashier/`, `migration/` and `storefront/` folders.

## Admin password

Reset it (ends all admin sessions) and write the new one to a root-only file:

```powershell
ssh root@23.246.154.136 "docker exec aistudio365-shop node server/dist/cli/admin-password.js admin --out /app/data/admin-password.txt && mv /opt/aistudio365-shop/data/admin-password.txt /opt/aistudio365-shop/admin-password.txt && chown root:root /opt/aistudio365-shop/admin-password.txt"
ssh root@23.246.154.136 "cat /opt/aistudio365-shop/admin-password.txt"
```

## Backups

The server copies the database once a day (Beijing date) to `data/backups/shop-YYYY-MM-DD.db` and
keeps the newest 14 (`BACKUP_KEEP`). They sit on the same disk, so now and then copy one to your
own computer:

```powershell
scp root@23.246.154.136:/opt/aistudio365-shop/data/backups/shop-*.db .
```

To restore: stop the container, replace `data/shop.db` with a backup (and delete `shop.db-wal`
and `shop.db-shm`), then start it again.

## Logs

```powershell
ssh root@23.246.154.136 "docker logs --tail 100 aistudio365-shop"
```
