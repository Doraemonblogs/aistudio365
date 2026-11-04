#!/usr/bin/env python3
"""Write the storefront tweaks into Dujiao-Next's site settings (后台 → 站点设置 → 自定义脚本).

Entries are matched by name and replaced, so re-running after editing a file updates it:
  hide-login-links  <- hide-login.css   (hide login entry points and the checkout mode buttons)
  phone-only-guest  <- phone-guest.js   (phone number instead of guest email + order password)
  guest-order-contact <- order-contact.js (商家联系方式 card on the guest order detail page)
"""
import json
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

DB = "/opt/dujiao-next/data/db/dujiao.db"
KIT = Path(__file__).resolve().parent
ENTRIES = [
    ("hide-login-links", "head", "<style>\n%s</style>", KIT / "hide-login.css"),
    ("phone-only-guest", "body_end", "<script>\n%s</script>", KIT / "phone-guest.js"),
    ("guest-order-contact", "body_end", "<script>\n%s</script>", KIT / "order-contact.js"),
]


def blob(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def main():
    shutil.copy(DB, "/root/backups/dujiao-before-storefront-%s.db" % datetime.now().strftime("%Y%m%d-%H%M%S"))
    db = sqlite3.connect(DB, timeout=15)
    with db:
        raw = db.execute("select value_json from settings where key='site_config'").fetchone()[0]
        site = json.loads(raw.decode() if isinstance(raw, (bytes, bytearray)) else raw)
        scripts = site.get("scripts", [])
        for name, position, wrapper, path in ENTRIES:
            code = wrapper % path.read_text(encoding="utf-8")
            if len(code) > 20000:
                sys.exit(f"{name}: {len(code)} chars, over the 20000 limit")
            entry = {"name": name, "enabled": True, "position": position, "code": code}
            for i, existing in enumerate(scripts):
                if existing.get("name") == name:
                    scripts[i] = entry
                    break
            else:
                scripts.append(entry)
            print(f"{name}: {len(code)} chars, position={position}")
        site["scripts"] = scripts
        db.execute("update settings set value_json=? where key='site_config'", (blob(site),))
    db.close()


if __name__ == "__main__":
    main()
