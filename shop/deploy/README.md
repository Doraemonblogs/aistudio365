# Deploying the shop

The shop runs on `root@23.246.154.136` as the Docker container `aistudio365-shop`, bound to
`127.0.0.1:18082`. The host nginx serves it at https://aistudio365.duckdns.org with the existing
Let's Encrypt certificate.

| What | Where on the server |
| --- | --- |
| Current release (source) | `/opt/aistudio365-shop/src`, previous one in `src.prev`, git revision in `REVISION` |
| Data | `/opt/aistudio365-shop/data`: `shop.db`, `uploads/`, `backups/` |
| First admin password | `/opt/aistudio365-shop/admin-password.txt` (root only); delete it after changing the password |
| nginx site | `/etc/nginx/sites-available/aistudio365` (certbot manages the HTTPS lines) |

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

## Switch the domain between the new shop and Dujiao-Next

```powershell
ssh root@23.246.154.136 "bash /opt/aistudio365-shop/src/deploy/nginx-switch.sh shop"
ssh root@23.246.154.136 "bash /opt/aistudio365-shop/src/deploy/nginx-switch.sh dujiao"
```

The script saves the old nginx file under `/root/nginx-aistudio365.<time>.bak`, changes only the
`proxy_pass` port, and restores the file if `nginx -t` fails.

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
