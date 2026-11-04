#!/usr/bin/env python3
"""Export the live Dujiao-Next catalog for import into the new shop.

Run on the server:  python3 export-dujiao.py <out dir>
Writes <out dir>/export.json and copies product images, the logo and the payment QR codes into
<out dir>/files/. Opens the Dujiao-Next database read-only; nothing there is changed.
"""
import json
import shutil
import sqlite3
import sys
from pathlib import Path

DUJIAO_DB = "/opt/dujiao-next/data/db/dujiao.db"
DUJIAO_UPLOADS = Path("/opt/dujiao-next/data/uploads")
CASHIER_QR = Path("/var/www/aistudio365-cashier/qr")
SKIP_SLUGS = {"pay-test"}


def load(raw):
    if raw is None:
        return None
    return json.loads(raw.decode() if isinstance(raw, (bytes, bytearray)) else raw)


def zh(raw):
    value = load(raw) or {}
    return (value.get("zh-CN") or "").strip() if isinstance(value, dict) else ""


def cents(value):
    return int(round(float(value) * 100))


def main():
    out = Path(sys.argv[1])
    files = out / "files"
    files.mkdir(parents=True, exist_ok=True)

    def copy_upload(path):
        if not path or not path.startswith("/uploads/"):
            return ""
        src = DUJIAO_UPLOADS / path[len("/uploads/"):]
        shutil.copy2(src, files / src.name)
        return src.name

    db = sqlite3.connect(f"file:{DUJIAO_DB}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row

    categories = [
        {"key": r["slug"], "name": zh(r["name_json"]), "sort": r["sort_order"]}
        for r in db.execute(
            "select slug, name_json, sort_order from categories where deleted_at is null and is_active = 1 order by sort_order desc"
        )
    ]

    products = []
    for r in db.execute(
        """select p.*, c.slug as category_slug,
                  (select s.manual_stock_total from product_skus s
                    where s.product_id = p.id and s.deleted_at is null order by s.id limit 1) as sku_stock
           from products p left join categories c on c.id = p.category_id
           where p.deleted_at is null order by p.sort_order desc"""
    ):
        if r["slug"] in SKIP_SLUGS:
            continue
        images = load(r["images"]) or []
        products.append({
            "slug": r["slug"],
            "category": r["category_slug"],
            "name": zh(r["title_json"]),
            "summary": zh(r["description_json"]),
            "description": zh(r["content_json"]),
            "instructions": zh(r["instructions_json"]),
            "price": cents(r["price_amount"]),
            "stock": r["sku_stock"] if r["sku_stock"] is not None else r["manual_stock_total"],
            "image": copy_upload(images[0]) if images else "",
            "active": bool(r["is_active"]),
            "sort": r["sort_order"],
        })

    def setting(key):
        row = db.execute("select value_json from settings where key = ?", (key,)).fetchone()
        return load(row[0]) if row else {}

    site = setting("site_config") or {}
    brand = site.get("brand") or {}
    announcement = setting("home_announcement") or {}

    qr = {}
    for name, candidates in (("wechat", ["wechat.png", "wechat.jpg", "wechat.webp"]),
                             ("alipay", ["alipay.png", "alipay.jpg", "alipay.webp"])):
        for candidate in candidates:
            src = CASHIER_QR / candidate
            if src.exists():
                shutil.copy2(src, files / f"qr-{candidate}")
                qr[name] = f"qr-{candidate}"
                break

    export = {
        "source": "Dujiao-Next on aistudio365.duckdns.org",
        "categories": categories,
        "products": products,
        "settings": {
            "shop_name": brand.get("site_name") or "AIStudio365",
            "logo": copy_upload(brand.get("site_logo") or ""),
            "notice": ((announcement.get("content") or {}).get("zh-CN") or "").strip(),
        },
        "qr": qr,
    }
    (out / "export.json").write_text(json.dumps(export, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"exported {len(categories)} categories, {len(products)} products, qr={sorted(qr)}, files={len(list(files.iterdir()))}")


if __name__ == "__main__":
    main()
