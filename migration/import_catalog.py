#!/usr/bin/env python3
"""Import the wzyp.cn shop catalog (catalog.json) into the Dujiao-Next SQLite database.

Run on the server with the app container stopped:
    python3 import_catalog.py catalog.json

It writes rows in the same shape the admin API produces (JSON columns as BLOBs, single
DEFAULT SKU per product, normalized manual-form schema), downloads product images into
the uploads folder and registers them in the media library. Re-running is safe: images,
categories and products that already exist (matched by name/slug) are left alone, and
settings are only written when the key is still empty.
"""
import json
import sqlite3
import struct
import sys
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

DB = "/opt/dujiao-next/data/db/dujiao.db"
UPLOADS = Path("/opt/dujiao-next/data/uploads")
LOCALES = ("zh-CN", "zh-TW", "en-US")


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f+00:00")


def blob(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def loc(text):
    """Localized field the way the admin form stores it: every locale key, zh-CN filled."""
    return {code: (text if code == "zh-CN" else "") for code in LOCALES}


def image_size(data):
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", data[16:24])
    if data[:2] == b"\xff\xd8":
        i = 2
        while i < len(data) - 9:
            if data[i] != 0xFF:
                i += 1
                continue
            marker = data[i + 1]
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                h, w = struct.unpack(">HH", data[i + 5:i + 9])
                return w, h
            seg_len = struct.unpack(">H", data[i + 2:i + 4])[0]
            i += 2 + seg_len
    return 0, 0


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://wzyp.cn/"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read(), resp.headers.get_content_type()


def import_images(db, images):
    paths = {}
    for key, spec in images.items():
        row = db.execute("select path from media where name = ? and deleted_at is null", (spec["name"],)).fetchone()
        if row:
            paths[key] = row[0]
            print(f"image {key}: exists {row[0]}")
            continue
        data, mime = fetch(spec["url"])
        ext = ".png" if mime == "image/png" else ".jpg"
        ts = datetime.now(timezone.utc)
        rel = f"{spec['scene']}/{ts:%Y}/{ts:%m}/{uuid.uuid4()}{ext}"
        target = UPLOADS / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        width, height = image_size(data)
        path = "/uploads/" + rel
        db.execute(
            "insert into media (name, filename, path, mime_type, size, scene, width, height, created_at) values (?,?,?,?,?,?,?,?,?)",
            (spec["name"], spec["name"], path, mime, len(data), spec["scene"], width, height, now()),
        )
        paths[key] = path
        print(f"image {key}: saved {path} ({len(data)} bytes, {width}x{height})")
    return paths


def import_categories(db, categories, paths):
    ids = {}
    for cat in categories:
        row = db.execute("select id from categories where slug = ?", (cat["slug"],)).fetchone()
        if row:
            ids[cat["slug"]] = row[0]
            print(f"category {cat['slug']}: exists id={row[0]}")
            continue
        cur = db.execute(
            "insert into categories (parent_id, slug, name_json, icon, sort_order, is_active, created_at) values (0,?,?,?,?,1,?)",
            (cat["slug"], blob(loc(cat["name"])), paths.get(cat["icon"], ""), cat["sort_order"], now()),
        )
        ids[cat["slug"]] = cur.lastrowid
        print(f"category {cat['slug']}: created id={cur.lastrowid}")
    return ids


def normalize_form(form):
    """Mirror manualform.NormalizeSchema output (key/type/required first, optional keys only when set)."""
    fields = []
    for f in form["fields"]:
        out = {"key": f["key"], "type": f["type"], "required": bool(f["required"])}
        for opt in ("label", "placeholder", "regex", "min", "max", "max_len", "options"):
            if f.get(opt) not in (None, "", {}, []):
                out[opt] = f[opt]
        fields.append(out)
    return {"fields": fields}


def import_products(db, catalog, cat_ids, paths):
    instructions = blob(loc(catalog["instructions"]))
    for p in catalog["products"]:
        row = db.execute("select id from products where slug = ?", (p["slug"],)).fetchone()
        if row:
            print(f"product {p['slug']}: exists id={row[0]}")
            continue
        ts = now()
        form = normalize_form(catalog["forms"][p["form"]]) if p.get("form") else {"fields": []}
        cur = db.execute(
            """insert into products (
                category_id, slug, seo_meta_json, title_json, description_json, content_json, instructions_json,
                price_amount, cost_price_amount, wholesale_prices, images, tags, purchase_type,
                min_purchase_quantity, max_purchase_quantity, stock_display_mode, fulfillment_type,
                manual_form_schema_json, manual_stock_total, manual_stock_locked, manual_stock_sold,
                payment_channel_ids, is_affiliate_enabled, is_mapped, is_active, sort_order, created_at, updated_at
            ) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                cat_ids[p["category"]], p["slug"], blob({}),
                blob(loc(p["title"])), blob(loc(p["description"])), blob(loc(p["content"])), instructions,
                p["price"], "0.00", blob([]), blob([paths[p["image"]]]), blob(p.get("tags", [])), "guest",
                0, 0, "status", "manual",
                blob(form), p["stock"], 0, 0,
                "", 0, 0, 1, p["sort_order"], ts, ts,
            ),
        )
        product_id = cur.lastrowid
        db.execute(
            """insert into product_skus (
                product_id, sku_code, spec_values_json, price_amount, cost_price_amount,
                manual_stock_total, manual_stock_locked, manual_stock_sold, is_active, sort_order, created_at, updated_at
            ) values (?, 'DEFAULT', ?, ?, '0.00', ?, 0, 0, 1, 0, ?, ?)""",
            (product_id, blob({}), p["price"], p["stock"], ts, ts),
        )
        print(f"product {p['slug']}: created id={product_id} price={p['price']} stock={p['stock']}")


def site_config(site, paths):
    logo = paths.get(site["logo"], "")
    return {
        "brand": {
            "site_name": site["site_name"],
            "site_url": site["site_url"],
            "site_icon": logo,
            "site_logo": logo,
            "site_description": loc(site["description"]),
        },
        "contact": {"telegram": "", "whatsapp": ""},
        "seo": {
            "title": loc(site["seo_title"]),
            "keywords": loc(site["seo_keywords"]),
            "description": loc(site["description"]),
        },
        "legal": {"terms": loc(""), "privacy": loc("")},
        "about": {
            "hero": {"title": loc(site["site_name"]), "subtitle": loc("AI智能工作室｜GPT 会员服务")},
            "introduction": loc(site["about_intro"]),
            "services": {"title": loc("我们的服务"), "items": [loc(item) for item in site["about_services"]]},
            "contact": {"title": loc("联系我们"), "text": loc(site["contact_text"])},
        },
        "scripts": [],
        "footer_links": site["footer_links"],
        "currency": "CNY",
        "template_mode": "card",
        "storefront_template": "classic",
        "languages": ["zh-CN"],
    }


def put_setting_if_missing(db, key, value):
    row = db.execute("select 1 from settings where key = ?", (key,)).fetchone()
    if row:
        print(f"setting {key}: exists, left unchanged")
        return
    db.execute("insert into settings (key, value_json) values (?, ?)", (key, blob(value)))
    print(f"setting {key}: written")


def main():
    catalog = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    db = sqlite3.connect(DB)
    print("journal_mode:", db.execute("pragma journal_mode").fetchone()[0])
    try:
        with db:
            paths = import_images(db, catalog["images"])
            cat_ids = import_categories(db, catalog["categories"], paths)
            import_products(db, catalog, cat_ids, paths)
            put_setting_if_missing(db, "site_config", site_config(catalog["site"], paths))
            ann = catalog["announcement"]
            put_setting_if_missing(db, "home_announcement", {
                "enabled": True, "type": "normal",
                "title": loc(ann["title"]), "content": loc(ann["content"]),
                "start_at": "", "end_at": "",
            })
    finally:
        db.close()
    print("done")


if __name__ == "__main__":
    main()
