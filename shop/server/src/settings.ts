import type { DB } from './db/index.js';

export interface ShopSettings {
  shop_name: string;
  logo: string;
  notice: string;
  contact_wechat: string;
  contact_qq: string;
  qr_wechat: string;
  qr_alipay: string;
  order_timeout_minutes: number;
}

export const DEFAULT_SETTINGS: Readonly<ShopSettings> = {
  shop_name: 'AIStudio365',
  logo: '',
  notice: '',
  contact_wechat: '',
  contact_qq: '',
  qr_wechat: '',
  qr_alipay: '',
  order_timeout_minutes: 60,
};

const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof ShopSettings)[];

/** Values are stored JSON-encoded; anything missing or of the wrong type falls back to the default. */
export function getSettings(db: DB): ShopSettings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const stored = new Map(rows.map((row) => [row.key, row.value]));
  const result: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const key of SETTING_KEYS) {
    const raw = stored.get(key);
    if (raw === undefined) continue;
    try {
      const value: unknown = JSON.parse(raw);
      if (typeof value === typeof DEFAULT_SETTINGS[key]) result[key] = value;
    } catch {
      // keep the default for unreadable values
    }
  }
  return result as unknown as ShopSettings;
}

export function updateSettings(db: DB, patch: Partial<ShopSettings>): ShopSettings {
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  db.transaction(() => {
    for (const key of SETTING_KEYS) {
      const value = patch[key];
      if (value === undefined) continue;
      if (typeof value !== typeof DEFAULT_SETTINGS[key]) throw new TypeError(`setting ${key} has the wrong type`);
      upsert.run(key, JSON.stringify(value));
    }
  })();
  return getSettings(db);
}
