# AIStudio365 shop deployment

Dujiao-Next (SQLite + Redis, Docker Compose) on `root@23.246.154.136`, served at
https://aistudio365.duckdns.org through the host nginx with a Let's Encrypt certificate.

| What | Where on the server |
| --- | --- |
| App files, data, secrets | `/opt/dujiao-next` (`.env` and `config/config.yml` are mode 600) |
| nginx site | `/etc/nginx/sites-available/aistudio365` (certbot added the HTTPS part) |
| Certificate | `/etc/letsencrypt/live/aistudio365.duckdns.org` (renewed by `certbot.timer`) |
| App port | `127.0.0.1:18081` only |

This folder holds no secrets. `deploy.sh` generates them once into `/opt/dujiao-next/.env`
and reuses them on every later run. `APP_SECRET_KEY` encrypts data in the database, so back
up `.env` together with `data/`.

## Redeploy or upgrade

Change `TAG` in `deploy.sh` if upgrading, then from PowerShell in this repo:

```powershell
ssh root@23.246.154.136 "rm -rf /root/aistudio365-deploy"
scp -r deploy root@23.246.154.136:/root/aistudio365-deploy
ssh root@23.246.154.136 "cd /root/aistudio365-deploy && sed -i 's/\r$//' * && bash deploy.sh"
```

## Admin login

The admin URL and first password are in `.env`:

```powershell
ssh root@23.246.154.136 "grep -E 'ADMIN' /opt/dujiao-next/.env"
```

Open `https://aistudio365.duckdns.org<ADMIN_PATH>` and change the password after the first login.

## Logs

```powershell
ssh root@23.246.154.136 "docker logs --tail 100 dujiao-next"
```
