# AIStudio365

The shop at https://aistudio365.duckdns.org. All the code is in [`shop/`](shop/README.md); deploying
it is covered in [`shop/deploy/README.md`](shop/deploy/README.md).

Until 2026-11-05 the domain ran Dujiao-Next. Its deploy scripts, static cashier, storefront tweaks
and catalog migration lived in `deploy/`, `cashier/`, `storefront/` and `migration/`. They were
removed when Dujiao-Next was retired and remain in git history.

`cashier/qr/` may still hold local copies of the payment QR codes; they are not in git.
