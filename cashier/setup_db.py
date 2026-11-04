#!/usr/bin/env python3
"""Point Dujiao-Next at the self-hosted scan-to-pay cashier.

- Adds two 易支付 (v1, redirect) channels whose gateway is https://<site>/cashier/, so the
  buyer lands on cashier/index.html with the order number and amount. The merchant id/key
  are placeholders that never leave the database; no third party is involved.
- Disables (does not delete) every other active 易支付 channel.
- Sets the order payment window to 60 minutes (same setting as 后台 → 订单设置).
- Rewrites every product's post-payment instructions (shown once the order is paid).
Safe to re-run.
"""
import json
import secrets
import sqlite3
from datetime import datetime, timezone

DB = "/opt/dujiao-next/data/db/dujiao.db"
SITE = "https://aistudio365.duckdns.org"
CHANNELS = [("支付宝扫码", "alipay", 20), ("微信扫码", "wechat", 10)]
INSTRUCTIONS = ("<p>✅ 已确认收款，客服正在为你办理，大约 5 分钟完成~</p>"
                "<p>如有疑问，请联系客服微信 <strong>aistudio361</strong> 并附上订单号。</p>")


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f+00:00")


def blob(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def main():
    db = sqlite3.connect(DB, timeout=15)
    db.row_factory = sqlite3.Row
    with db:
        cashier_gateway = SITE + "/cashier/"
        existing = {}
        for row in db.execute("select id, name, config_json from payment_channels where deleted_at is null"):
            raw = row["config_json"]
            cfg = json.loads(raw.decode() if isinstance(raw, (bytes, bytearray)) else (raw or "{}"))
            existing[row["id"]] = (row["name"], cfg.get("gateway_url", ""))

        for name, channel_type, sort in CHANNELS:
            if any(n == name and gw == cashier_gateway for n, gw in existing.values()):
                print(f"channel {name}: exists")
                continue
            config = {
                "epay_version": "v1",
                "gateway_url": cashier_gateway,
                "merchant_id": "self",
                "merchant_key": secrets.token_hex(16),
                "notify_url": SITE + "/api/v1/payments/callback",
                "return_url": SITE + "/pay",
            }
            ts = now()
            cur = db.execute(
                """insert into payment_channels (name, icon, provider_type, channel_type, interaction_mode, fee_rate, fixed_fee,
                   min_amount, max_amount, hide_amount_out_range, payment_roles, member_levels, payment_types, config_json,
                   is_active, sort_order, created_at, updated_at)
                   values (?, '', 'epay', ?, 'redirect', 0, 0, 0, 0, 0, ?, ?, ?, ?, 1, ?, ?, ?)""",
                (name, channel_type, blob([]), blob([]), blob([]), blob(config), sort, ts, ts),
            )
            print(f"channel {name}: created id={cur.lastrowid}")

        for cid, (name, gateway) in existing.items():
            if gateway and gateway != cashier_gateway:
                db.execute("update payment_channels set is_active=0, updated_at=? where id=? and is_active=1", (now(), cid))
                print(f"channel {name} (id={cid}, {gateway}): disabled")

        order_cfg = blob({"payment_expire_minutes": 60, "max_refund_days": 30})
        if db.execute("select 1 from settings where key='order_config'").fetchone():
            db.execute("update settings set value_json=? where key='order_config'", (order_cfg,))
        else:
            db.execute("insert into settings (key, value_json) values ('order_config', ?)", (order_cfg,))
        print("order_config: payment_expire_minutes=60")

        n = db.execute(
            "update products set instructions_json=?, updated_at=? where deleted_at is null",
            (blob({"zh-CN": INSTRUCTIONS, "zh-TW": "", "en-US": ""}), now()),
        ).rowcount
        print(f"instructions updated on {n} products")
    db.close()


if __name__ == "__main__":
    main()
