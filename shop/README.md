# AIStudio365 shop

A small shop: buyers pick a product, enter a phone number, pay with the owner's personal WeChat
or Alipay QR code and contact customer service; the admin manages products, confirms payments
and sees sales. Design: the development doc
(https://claude.ai/artifact/RjSvQ4B2Q7egt5QpXMg4r7).

Node.js 24 + TypeScript + Fastify + SQLite (better-sqlite3). Vue 3 frontend comes in phase 2.

## Layout

| Path | What |
| --- | --- |
| `server/src/` | HTTP server, database schema and migrations, settings, password hashing |
| `scripts/` | Dujiao-Next export/import, product listing, admin password |
| `scripts/dev/` | `sync.cmd` copies the source to the server; `run.sh` runs a command there in Docker |
| `tests/` | Vitest tests |
| `data/` (not in git) | `shop.db`, `uploads/`, import exports |

## Development

Node isn't installed on the Windows machine, so commands run on the server in a `node:24-bookworm`
container, with the source in `/root/aistudio365-shop-dev` and `node_modules` in a Docker volume.

```powershell
cmd /c shop\scripts\dev\sync.cmd
ssh root@23.246.154.136 "cd /root/aistudio365-shop-dev && bash scripts/dev/run.sh npm test"
```

Useful commands (inside that container):

| Command | Does |
| --- | --- |
| `npm run typecheck` / `npm test` | Type check / run tests |
| `npm run dev` | Start the server on port 3000 with reload |
| `npm run import:dujiao -- data/import [--replace]` | Import the catalog exported by `scripts/export-dujiao.py` |
| `npm run products:list` | Print products and shop settings |
| `npm run admin:password -- [username] [--out file]` | Create the admin or reset its password |

Export from the live Dujiao-Next (read-only), on the server: `python3 scripts/export-dujiao.py data/import`.
