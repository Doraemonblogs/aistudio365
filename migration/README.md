# Catalog migration from wzyp.cn

`catalog.json` holds the 8 products, 3 categories, shop announcement and contact details
captured from https://wzyp.cn/shop/aistudio365 on 2026-11-04, in the shape
`import_catalog.py` writes into the Dujiao-Next database. It was imported on 2026-11-04;
the database from just before the import is in `/root/backups/dujiao-before-import-*.db`.

What the import set up:

- Every product is **manual delivery** (人工交付) with the stock the old shop showed, and can
  be bought as a guest (email + order password, no account needed).
- No delivery-info form at checkout (removed 2026-11-04 at the owner's request): buyers send
  the account to top up to customer service on WeChat after paying. The `forms` block in
  catalog.json is kept for reference but no product uses it.
- Site name, logo (the old shop avatar), SEO text, About page, footer links and the home
  announcement come from the old shop. The old line about wzyp platform fees was dropped.

The card secrets for the Google account and Claude Pro products live in the wzyp seller
backend and were not migrated. Import them in 后台 → 卡密管理 and switch those products to
automatic delivery when ready.

To run it again (safe to repeat; existing rows are kept):

```powershell
ssh root@23.246.154.136 "rm -rf /root/aistudio365-migration"
scp -r migration root@23.246.154.136:/root/aistudio365-migration
ssh root@23.246.154.136 "cd /root/aistudio365-migration && sed -i 's/\r$//' *.sh *.py && bash run_import.sh"
```
