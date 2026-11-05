import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../server/src/app.js';
import { openDb, type DB } from '../server/src/db/index.js';
import { updateSettings } from '../server/src/settings.js';
import { expireOrders } from '../server/src/shop/orders.js';
import { stockStatus } from '../server/src/shop/products.js';

let db: DB;
let app: FastifyInstance;
let uploadsDir: string;
let ids: { plus: number; gmail: number; hidden: number; pool: number; category: number };

function seed(): void {
  const now = new Date().toISOString();
  const category = Number(
    db.prepare("INSERT INTO categories (name, sort, created_at) VALUES ('GPT', 10, ?)").run(now).lastInsertRowid,
  );
  const insert = db.prepare(`
    INSERT INTO products (category_id, name, summary, description, instructions, price, original_price, image,
                          qr_wechat, stock, max_qty, card_mode, card_text, status, sort, created_at, updated_at)
    VALUES (@category_id, @name, '', '<p>desc</p>', '<p>how to use</p>', @price, NULL, '/uploads/p.jpg',
            @qr_wechat, @stock, @max_qty, @card_mode, '请联系微信客服', @status, @sort, @now, @now)`);
  const add = (name: string, extra: Partial<Record<string, unknown>>) =>
    Number(
      insert.run({
        category_id: category,
        name,
        price: 12500,
        qr_wechat: '',
        stock: 10,
        max_qty: 5,
        card_mode: 'fixed',
        status: 'on',
        sort: 0,
        now,
        ...extra,
      }).lastInsertRowid,
    );
  ids = {
    category,
    plus: add('Plus', { qr_wechat: '/uploads/plus-125.png', sort: 9 }),
    gmail: add('Gmail', { price: 2800, stock: 2 }),
    hidden: add('Hidden', { status: 'off' }),
    pool: add('Pool', { card_mode: 'pool', stock: -1 }),
  };
  db.prepare("INSERT INTO cards (product_id, content, created_at) VALUES (?, 'CODE-1', ?), (?, 'CODE-2', ?)").run(
    ids.pool,
    now,
    ids.pool,
    now,
  );
  updateSettings(db, { qr_wechat: '/uploads/qr-wechat.png', qr_alipay: '/uploads/qr-alipay.jpg', contact_wechat: 'wx' });
}

const order = (body: Record<string, unknown>, ip = '1.1.1.1') =>
  app.inject({ method: 'POST', url: '/api/orders', payload: body, headers: { 'x-forwarded-for': ip } });

beforeEach(async () => {
  uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shop-test-'));
  db = openDb(':memory:');
  seed();
  app = buildApp(db, { uploadsDir, logger: false });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  db.close();
  fs.rmSync(uploadsDir, { recursive: true, force: true });
});

describe('stock levels', () => {
  it('reads 缺货 / 仅剩少量 / 库存一般 / 库存充足 from the units left', () => {
    expect([0, 1, 5, 6, 20, 21, null].map(stockStatus)).toEqual(['out', 'low', 'low', 'medium', 'medium', 'plenty', 'plenty']);
  });
});

describe('catalog', () => {
  it('lists on-shelf products only, without stock counts or card content', async () => {
    const res = await app.inject('/api/products');
    expect(res.statusCode).toBe(200);
    const products = res.json() as Record<string, unknown>[];
    expect(products.map((p) => p.name)).toEqual(['Plus', 'Gmail', 'Pool']);
    expect(products[0]).toMatchObject({ stock_status: 'medium' });
    expect(products[1]).toMatchObject({ stock_status: 'low' });
    for (const p of products) {
      expect(p).not.toHaveProperty('stock');
      expect(p).not.toHaveProperty('card_text');
      expect(p).not.toHaveProperty('qr_wechat');
    }
  });

  it('shows details and caps max_qty at what is left', async () => {
    const res = await app.inject(`/api/products/${ids.gmail}`);
    expect(res.json()).toMatchObject({ name: 'Gmail', description: '<p>desc</p>', max_qty: 2 });
    expect((await app.inject(`/api/products/${ids.hidden}`)).statusCode).toBe(404);
  });

  it('returns shop settings and categories', async () => {
    const res = await app.inject('/api/shop');
    expect(res.json()).toMatchObject({ contact_wechat: 'wx', categories: [{ id: ids.category, name: 'GPT' }] });
    expect(res.json()).not.toHaveProperty('qr_wechat');
  });
});

describe('placing orders', () => {
  it('creates a pending order, holds stock and returns the fixed-amount QR for one unit', async () => {
    const res = await order({ product_id: ids.plus, quantity: 1, phone: '+86 138-0013-8000', pay_method: 'wechat' });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.order_no).toMatch(/^A\d{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(body).toMatchObject({ status: 'pending', amount: 12500, qr: { url: '/uploads/plus-125.png', fixed_amount: true } });
    expect(body.cards).toEqual([]);
    expect(body.instructions).toBe('');
    expect(db.prepare('SELECT stock FROM products WHERE id = ?').get(ids.plus)).toEqual({ stock: 9 });
  });

  it('uses the general QR for several units', async () => {
    const res = await order({ product_id: ids.plus, quantity: 2, phone: '13800138000', pay_method: 'alipay' });
    expect(res.json()).toMatchObject({ amount: 25000, qr: { url: '/uploads/qr-alipay.jpg', fixed_amount: false } });
  });

  it('rejects bad phone numbers, quantities and stock', async () => {
    expect((await order({ product_id: ids.plus, quantity: 1, phone: '12345', pay_method: 'wechat' })).json()).toEqual({
      error: '请输入正确的 11 位手机号',
    });
    expect((await order({ product_id: ids.plus, quantity: 6, phone: '13800138000', pay_method: 'wechat' })).statusCode).toBe(400);
    expect((await order({ product_id: ids.gmail, quantity: 3, phone: '13800138000', pay_method: 'wechat' })).json()).toEqual({
      error: '库存不足，最多还能买 2 件',
    });
    expect((await order({ product_id: ids.hidden, quantity: 1, phone: '13800138000', pay_method: 'wechat' })).statusCode).toBe(404);
    expect((await order({ product_id: ids.plus, quantity: 1, phone: '13800138000', pay_method: 'paypal' })).statusCode).toBe(400);
  });

  it('allows three unpaid orders per phone', async () => {
    for (let i = 0; i < 3; i++) {
      expect((await order({ product_id: ids.plus, quantity: 1, phone: '13800138000', pay_method: 'wechat' }, `2.2.2.${i}`)).statusCode).toBe(201);
    }
    const fourth = await order({ product_id: ids.plus, quantity: 1, phone: '13800138000', pay_method: 'wechat' }, '2.2.2.9');
    expect(fourth.statusCode).toBe(429);
  });

  it('limits each IP to five orders a minute', async () => {
    for (let i = 0; i < 5; i++) {
      const phone = `1380013800${i}`;
      expect((await order({ product_id: ids.plus, quantity: 1, phone, pay_method: 'wechat' }, '3.3.3.3')).statusCode).toBe(201);
    }
    expect((await order({ product_id: ids.plus, quantity: 1, phone: '13800138009', pay_method: 'wechat' }, '3.3.3.3')).statusCode).toBe(429);
  });

  it('counts pending orders against a card pool', async () => {
    expect((await order({ product_id: ids.pool, quantity: 2, phone: '13800138000', pay_method: 'wechat' })).statusCode).toBe(201);
    expect((await app.inject(`/api/products/${ids.pool}`)).json()).toMatchObject({ stock_status: 'out', max_qty: 0 });
    expect((await order({ product_id: ids.pool, quantity: 1, phone: '13900139000', pay_method: 'wechat' })).statusCode).toBe(409);
  });
});

describe('looking up orders', () => {
  it('needs the matching phone and hides delivery until paid', async () => {
    const placed = (await order({ product_id: ids.plus, quantity: 1, phone: '13800138000', pay_method: 'wechat' })).json();
    expect((await app.inject(`/api/orders/${placed.order_no}?phone=13900139000`)).statusCode).toBe(404);
    const pending = (await app.inject(`/api/orders/${placed.order_no.toLowerCase()}?phone=13800138000`)).json();
    expect(pending).toMatchObject({ status: 'pending', cards: [], instructions: '' });

    db.prepare("UPDATE orders SET status = 'paid', paid_at = ?, cards = ? WHERE order_no = ?").run(
      new Date().toISOString(),
      JSON.stringify(['请联系微信客服']),
      placed.order_no,
    );
    const paid = (await app.inject(`/api/orders/${placed.order_no}?phone=13800138000`)).json();
    expect(paid).toMatchObject({ status: 'paid', cards: ['请联系微信客服'], instructions: '<p>how to use</p>', qr: null });
  });

  it('lists a phone number’s orders, newest first', async () => {
    await order({ product_id: ids.plus, quantity: 1, phone: '13800138000', pay_method: 'wechat' });
    await order({ product_id: ids.gmail, quantity: 1, phone: '13800138000', pay_method: 'alipay' });
    await order({ product_id: ids.gmail, quantity: 1, phone: '13900139000', pay_method: 'alipay' });
    const list = (await app.inject('/api/orders?phone=13800138000')).json() as { product_name: string }[];
    expect(list.map((o) => o.product_name)).toEqual(['Gmail', 'Plus']);
    expect((await app.inject('/api/orders?phone=abc')).statusCode).toBe(400);
  });
});

describe('buyer marks an order paid', () => {
  const markPaid = (orderNo: string, phone = '13800138000') =>
    app.inject({ method: 'POST', url: `/api/orders/${orderNo}/paid`, payload: { phone } });

  it('shows the cards at once and is safe to repeat', async () => {
    const placed = (await order({ product_id: ids.plus, quantity: 1, phone: '13800138000', pay_method: 'wechat' })).json();
    expect((await markPaid(placed.order_no, '13900139000')).statusCode).toBe(404);
    const paid = await markPaid(placed.order_no.toLowerCase());
    expect(paid.statusCode).toBe(200);
    expect(paid.json()).toMatchObject({ status: 'paid', cards: ['请联系微信客服'], instructions: '<p>how to use</p>', qr: null });
    expect(paid.json().paid_at).toEqual(expect.any(String));
    expect((await markPaid(placed.order_no)).json()).toMatchObject({ status: 'paid', paid_at: paid.json().paid_at });
    expect(db.prepare('SELECT stock FROM products WHERE id = ?').get(ids.plus)).toEqual({ stock: 9 });
  });

  it('hands out pool cards, and leaves the order pending when the pool ran dry', async () => {
    const first = (await order({ product_id: ids.pool, quantity: 1, phone: '13800138000', pay_method: 'wechat' })).json();
    const second = (await order({ product_id: ids.pool, quantity: 1, phone: '13900139000', pay_method: 'wechat' })).json();
    expect((await markPaid(first.order_no)).json().cards).toEqual(['CODE-1']);
    db.prepare("DELETE FROM cards WHERE status = 'available'").run();
    const refused = await markPaid(second.order_no, '13900139000');
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toBe('卡密暂时不够，请联系客服处理');
    expect(db.prepare('SELECT status FROM orders WHERE order_no = ?').get(second.order_no)).toEqual({ status: 'pending' });
  });

  it('refuses an order past its deadline', async () => {
    const placed = (await order({ product_id: ids.plus, quantity: 1, phone: '13800138000', pay_method: 'wechat' })).json();
    db.prepare('UPDATE orders SET expire_at = ? WHERE order_no = ?').run(new Date(Date.now() - 1000).toISOString(), placed.order_no);
    const res = await markPaid(placed.order_no);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/订单已取消/);
    expect(db.prepare('SELECT stock FROM products WHERE id = ?').get(ids.plus)).toEqual({ stock: 10 });
  });
});

describe('expiry', () => {
  it('cancels unpaid orders after the deadline and gives the stock back', async () => {
    const placed = (await order({ product_id: ids.gmail, quantity: 2, phone: '13800138000', pay_method: 'wechat' })).json();
    expect(db.prepare('SELECT stock FROM products WHERE id = ?').get(ids.gmail)).toEqual({ stock: 0 });
    expect(expireOrders(db, new Date(Date.now() + 59 * 60_000).toISOString())).toBe(0);
    expect(expireOrders(db, new Date(Date.now() + 61 * 60_000).toISOString())).toBe(1);
    expect(db.prepare('SELECT status FROM orders WHERE order_no = ?').get(placed.order_no)).toEqual({ status: 'cancelled' });
    expect(db.prepare('SELECT stock FROM products WHERE id = ?').get(ids.gmail)).toEqual({ stock: 2 });
  });
});
