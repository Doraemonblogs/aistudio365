import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrate } from '../server/src/db/index.js';
import { migrations } from '../server/src/db/schema.js';
import { hashPassword, randomPassword, verifyPassword } from '../server/src/passwords.js';
import { DEFAULT_SETTINGS, getSettings, updateSettings } from '../server/src/settings.js';

const freshDb = () => {
  const db = new Database(':memory:');
  migrate(db);
  return db;
};

describe('schema', () => {
  it('creates every table and is safe to run twice', () => {
    const db = freshDb();
    expect(migrate(db)).toBe(migrations.length);
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(
      (row) => row.name,
    );
    expect(tables).toEqual(
      expect.arrayContaining(['categories', 'products', 'orders', 'cards', 'settings', 'admins', 'sessions']),
    );
  });

  it('rejects invalid values', () => {
    const db = freshDb();
    const product = db.prepare(
      "INSERT INTO products (name, price, created_at, updated_at) VALUES ('x', ?, 'now', 'now')",
    );
    expect(() => product.run(-1)).toThrow(/CHECK/);
    const productId = Number(product.run(100).lastInsertRowid);
    const order = db.prepare(
      `INSERT INTO orders (order_no, phone, product_id, product_name, unit_price, quantity, amount, pay_method, status, created_at, expire_at)
       VALUES (?, '13800138000', ?, 'x', 100, 1, 100, 'wechat', ?, 'now', 'later')`,
    );
    expect(() => order.run('A1', productId, 'shipped')).toThrow(/CHECK/);
    order.run('A1', productId, 'pending');
    expect(() => order.run('A1', productId, 'pending')).toThrow(/UNIQUE/);
  });
});

describe('settings', () => {
  it('returns defaults, stores values and ignores wrong types', () => {
    const db = freshDb();
    expect(getSettings(db)).toEqual(DEFAULT_SETTINGS);
    updateSettings(db, { shop_name: 'Test', order_timeout_minutes: 30 });
    expect(getSettings(db)).toMatchObject({ shop_name: 'Test', order_timeout_minutes: 30 });
    db.prepare("UPDATE settings SET value = '\"oops\"' WHERE key = 'order_timeout_minutes'").run();
    expect(getSettings(db).order_timeout_minutes).toBe(DEFAULT_SETTINGS.order_timeout_minutes);
  });
});

describe('passwords', () => {
  it('verifies the right password only', async () => {
    const hash = await hashPassword('correct horse');
    expect(await verifyPassword('correct horse', hash)).toBe(true);
    expect(await verifyPassword('wrong horse', hash)).toBe(false);
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
  });

  it('generates passwords without look-alike characters', () => {
    const password = randomPassword(64);
    expect(password).toHaveLength(64);
    expect(password).not.toMatch(/[0O1lI]/);
  });
});
