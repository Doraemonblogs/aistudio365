# AIStudio365 shop

A small shop: buyers pick a product, enter a phone number, pay with the owner's personal WeChat
or Alipay QR code and tap 「我已付款」. That is taken on trust, so their cards show at once; they
then contact customer service. The admin manages products, works through paid orders (voiding
any whose money never arrived) and sees sales. Design: the development doc
(https://claude.ai/artifact/RjSvQ4B2Q7egt5QpXMg4r7); buyer-confirmed payment came later and
replaces the doc's "customer service confirms first" step.

Node.js 24 + TypeScript 6 + Fastify + SQLite (better-sqlite3); Vue 3 + Vite + Tailwind CSS 4.
(TypeScript stays on 6 because vue-tsc does not support the TypeScript 7 native compiler yet.)

## Layout

| Path | What |
| --- | --- |
| `server/src/` | HTTP server, database schema and migrations, settings, password hashing |
| `server/src/routes/public.ts` | Buyer API: shop info, products, place an order, look up orders |
| `server/src/routes/admin.ts` | Admin API under `/api/admin`: login, products, cards, orders, stats, settings, uploads |
| `server/src/auth.ts` | Admin sessions (cookie `shop_admin`, 7 days, sliding) and the login lockout |
| `server/src/shop/` | Product stock and order rules (holding stock, expiry, order numbers), sales stats |
| `web/` | Buyer pages: home, product, cashier, order detail, order lookup |
| `web/src/admin/` | Admin pages at `/admin`: orders, products and cards, stats, settings, password |
| `server/src/cli/` | Admin password reset; compiled into the image, so it also runs in production |
| `scripts/` | Dujiao-Next export/import, product listing |
| `Dockerfile`, `deploy/` | Production image, compose file and deploy scripts; see `deploy/README.md` |
| `scripts/dev/` | `sync.cmd` copies the source to the server; `run.sh` runs a command there in Docker |
| `tests/` | Vitest tests |
| `data/` (not in git) | `shop.db`, `uploads/`, import exports |

## Development

Node isn't installed on the Windows machine, so commands run on the server in a `node:24-bookworm`
container, with the source in `/root/aistudio365-shop-dev` and `node_modules` in a Docker volume.

```powershell
cmd /c shop\scripts\dev\sync.cmd
ssh root@23.246.154.136 "bash /root/aistudio365-shop-dev/scripts/dev/check.sh"
```

`check.sh` runs both type checks, the tests and the frontend build. After adding a dependency on
the server, copy `package.json` and `package-lock.json` back, or the next sync reverts them.

A dev instance runs on the server as the `aistudio365-shop-dev` container, bound to
`127.0.0.1:18090` only. The `shop-dev` entry in `.claude/launch.json` opens an SSH tunnel to it so
it can be viewed at http://localhost:18090. Rebuild the frontend (`npm run build:web`) to see page
changes; the server reloads on its own. The container runs with `COOKIE_SECURE=false` because the
tunnel is plain HTTP; its admin login is in `data/dev-admin.txt` on the server (not in git).

Useful commands (inside that container):

| Command | Does |
| --- | --- |
| `npm run typecheck` / `npm run typecheck:web` / `npm test` | Type check server / frontend, run tests |
| `npm run build` | Build the frontend into `web/dist` and the server into `server/dist` |
| `npm run dev` | Start the server on port 3000 with reload |
| `npm run import:dujiao -- data/import [--replace]` | Import the catalog exported by `scripts/export-dujiao.py` |
| `npm run products:list` | Print products and shop settings |
| `npm run admin:password -- [username] [--out file]` | Create the admin or reset its password |

The Dujiao-Next import was a one-off and is done. Dujiao-Next has since been removed from the
server; to export from it again, unpack its archive (see `deploy/README.md`) back to
`/opt/dujiao-next` and `/var/www/aistudio365-cashier` and run
`python3 scripts/export-dujiao.py data/import` there.
