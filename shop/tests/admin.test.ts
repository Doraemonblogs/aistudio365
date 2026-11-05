import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../server/src/app.js';
import { openDb, type DB } from '../server/src/db/index.js';
import { hashPassword } from '../server/src/passwords.js';

let db: DB;
let app: FastifyInstance;
let uploadsDir: string;
let cookie: string;

const PASSWORD = 'test-password-1';

function sessionCookie(res: LightMyRequestResponse): string {
  const header = res.headers['set-cookie'];
  const raw = Array.isArray(header) ? header[0] : header;
  return String(raw).split(';')[0]!;
}

const login = (password = PASSWORD, ip = '9.9.9.9') =>
  app.inject({ method: 'POST', url: '/api/admin/login', payload: { username: 'admin', password }, headers: { 'x-forwarded-for': ip } });

const api = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
  app.inject({ method, url, payload: payload as Record<string, unknown> | undefined, headers: { cookie } });

const baseProduct = {
  name: 'Plus',
  price: 12500,
  stock: 5,
  max_qty: 5,
  card_mode: 'fixed',
  card_text: '请联系微信客服',
  status: 'on',
};

const placeOrder = async (productId: number, quantity = 1, phone = '13800138000') =>
  (
    await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: { product_id: productId, quantity, phone, pay_method: 'wechat' },
      headers: { 'x-forwarded-for': `5.5.5.${Math.floor(Math.random() * 250)}` },
    })
  ).json() as { order_no: string };

const orderId = (orderNo: string) =>
  (db.prepare('SELECT id FROM orders WHERE order_no = ?').get(orderNo) as { id: number }).id;

beforeEach(async () => {
  uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shop-admin-'));
  db = openDb(':memory:');
  db.prepare("INSERT INTO admins (username, password_hash, created_at) VALUES ('admin', ?, 'now')").run(await hashPassword(PASSWORD));
  app = buildApp(db, { uploadsDir, logger: false, cookieSecure: false });
  await app.ready();
  cookie = sessionCookie(await login());
});

afterEach(async () => {
  await app.close();
  db.close();
  fs.rmSync(uploadsDir, { recursive: true, force: true });
});

describe('login', () => {
  it('needs a session for admin endpoints', async () => {
    expect((await app.inject('/api/admin/me')).statusCode).toBe(401);
    expect((await api('GET', '/api/admin/me')).json()).toEqual({ username: 'admin' });
  });

  it('sets an HttpOnly SameSite=Strict cookie', async () => {
    const header = String((await login()).headers['set-cookie']);
    expect(header).toMatch(/HttpOnly/);
    expect(header).toMatch(/SameSite=Strict/);
  });

  it('locks a username on one IP after five wrong passwords', async () => {
    for (let i = 0; i < 5; i++) expect((await login('wrong', '8.8.8.8')).statusCode).toBe(401);
    const locked = await login(PASSWORD, '8.8.8.8');
    expect(locked.statusCode).toBe(429);
    expect(locked.json().error).toMatch(/分钟后再试/);
    expect((await login(PASSWORD, '7.7.7.7')).statusCode).toBe(200);
  });

  it('logs out and changes the password, signing out other sessions', async () => {
    const other = sessionCookie(await login());
    expect((await api('PUT', '/api/admin/password', { current: 'nope', next: 'new-password-2' })).statusCode).toBe(400);
    expect((await api('PUT', '/api/admin/password', { current: PASSWORD, next: 'new-password-2' })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/admin/me', headers: { cookie: other } })).statusCode).toBe(401);
    expect((await api('GET', '/api/admin/me')).statusCode).toBe(200);
    expect((await login('new-password-2')).statusCode).toBe(200);
    await api('POST', '/api/admin/logout');
    expect((await api('GET', '/api/admin/me')).statusCode).toBe(401);
  });
});

describe('products and categories', () => {
  it('creates, updates, lists and toggles products', async () => {
    const category = (await api('POST', '/api/admin/categories', { name: 'GPT', sort: 3 })).json().id as number;
    const created = await api('POST', '/api/admin/products', { ...baseProduct, category_id: category });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as number;
    const updated = await api('PUT', `/api/admin/products/${id}`, { ...baseProduct, name: 'Plus 月卡', price: 13000, stock: 15 });
    expect(updated.json()).toMatchObject({ name: 'Plus 月卡', price: 13000, stock: 15, available: 15, category_id: category });
    const cleared = await api('PUT', `/api/admin/products/${id}`, { ...baseProduct, category_id: null });
    expect(cleared.json().category_id).toBeNull();
    await api('PATCH', `/api/admin/products/${id}/status`, { status: 'off' });
    expect((await app.inject('/api/products')).json()).toEqual([]);
    expect((await api('GET', '/api/admin/products')).json()).toHaveLength(1);
  });

  it('rejects outside image URLs and unknown categories', async () => {
    expect((await api('POST', '/api/admin/products', { ...baseProduct, image: 'https://evil.example/x.png' })).statusCode).toBe(400);
    expect((await api('POST', '/api/admin/products', { ...baseProduct, category_id: 99 })).json().error).toBe('分类不存在');
    expect((await api('POST', '/api/admin/products', { ...baseProduct, price: -1 })).statusCode).toBe(400);
  });

  it('refuses to delete a product that has orders', async () => {
    const id = (await api('POST', '/api/admin/products', baseProduct)).json().id as number;
    const spare = (await api('POST', '/api/admin/products', { ...baseProduct, name: 'Spare' })).json().id as number;
    await placeOrder(id);
    expect((await api('DELETE', `/api/admin/products/${id}`)).statusCode).toBe(409);
    expect((await api('DELETE', `/api/admin/products/${spare}`)).statusCode).toBe(200);
  });
});

describe('orders', () => {
  it('confirms, completes and delivers the fixed card text', async () => {
    const id = (await api('POST', '/api/admin/products', baseProduct)).json().id as number;
    const placed = await placeOrder(id, 2);
    const listed = (await api('GET', '/api/admin/orders?status=pending')).json();
    expect(listed).toMatchObject({ total: 1, counts: { pending: 1 } });
    expect(listed.items[0]).toMatchObject({ order_no: placed.order_no, phone: '13800138000', amount: 25000 });

    const confirmed = await api('POST', `/api/admin/orders/${orderId(placed.order_no)}/confirm`);
    expect(confirmed.json()).toMatchObject({ status: 'paid', cards: ['请联系微信客服'] });
    expect((await api('POST', `/api/admin/orders/${orderId(placed.order_no)}/confirm`)).statusCode).toBe(409);
    expect((await api('POST', `/api/admin/orders/${orderId(placed.order_no)}/complete`)).json()).toMatchObject({ status: 'completed' });

    const buyer = (await app.inject(`/api/orders/${placed.order_no}?phone=13800138000`)).json();
    expect(buyer).toMatchObject({ status: 'completed', cards: ['请联系微信客服'] });
  });

  it('cancels pending orders and can still confirm a late payment', async () => {
    const id = (await api('POST', '/api/admin/products', baseProduct)).json().id as number;
    const placed = await placeOrder(id, 2);
    const oid = orderId(placed.order_no);
    expect((await api('POST', `/api/admin/orders/${oid}/cancel`)).json()).toMatchObject({ status: 'cancelled' });
    expect((await api('GET', `/api/admin/products/${id}`)).json().stock).toBe(5);
    expect((await api('POST', `/api/admin/orders/${oid}/confirm`)).json()).toMatchObject({ status: 'paid', cancelled_at: null });
    expect((await api('GET', `/api/admin/products/${id}`)).json().stock).toBe(3);
  });

  it('voids a buyer-marked paid order whose money never came', async () => {
    const id = (await api('POST', '/api/admin/products', baseProduct)).json().id as number;
    const placed = await placeOrder(id, 2);
    await app.inject({ method: 'POST', url: `/api/orders/${placed.order_no}/paid`, payload: { phone: '13800138000' } });
    expect((await api('GET', '/api/admin/stats/summary')).json().paid_orders).toBe(1);
    expect((await api('GET', `/api/admin/products/${id}`)).json().stock).toBe(3);

    const oid = orderId(placed.order_no);
    expect((await api('POST', `/api/admin/orders/${oid}/cancel`)).json()).toMatchObject({ status: 'cancelled', paid_at: null });
    expect((await api('GET', `/api/admin/products/${id}`)).json().stock).toBe(5);
    const buyer = (await app.inject(`/api/orders/${placed.order_no}?phone=13800138000`)).json();
    expect(buyer).toMatchObject({ status: 'cancelled', cards: [], instructions: '' });

    // The money turns up after all: confirm again; completed orders can't be cancelled.
    expect((await api('POST', `/api/admin/orders/${oid}/confirm`)).json()).toMatchObject({ status: 'paid' });
    expect((await api('GET', `/api/admin/products/${id}`)).json().stock).toBe(3);
    await api('POST', `/api/admin/orders/${oid}/complete`);
    expect((await api('POST', `/api/admin/orders/${oid}/cancel`)).statusCode).toBe(409);
  });

  it('hands out pool cards and refuses when they run out', async () => {
    const id = (await api('POST', '/api/admin/products', { ...baseProduct, card_mode: 'pool' })).json().id as number;
    expect((await api('POST', `/api/admin/products/${id}/cards`, { text: 'A-1\nA-2\n\nA-2\nA-3 ' })).json()).toEqual({
      added: 3,
      skipped: 1,
    });
    const first = await placeOrder(id, 2);
    const second = await placeOrder(id, 1, '13900139000');
    expect((await api('POST', `/api/admin/orders/${orderId(first.order_no)}/confirm`)).json().cards).toEqual(['A-1', 'A-2']);
    const sold = (await api('GET', `/api/admin/products/${id}/cards?status=sold`)).json() as { id: number; order_no: string }[];
    expect(sold.map((c) => c.order_no)).toEqual([first.order_no, first.order_no]);
    expect((await api('DELETE', `/api/admin/cards/${sold[0]!.id}`)).statusCode).toBe(409);

    await api('POST', `/api/admin/orders/${orderId(second.order_no)}/cancel`);
    const available = (await api('GET', `/api/admin/products/${id}/cards?status=available`)).json() as { id: number }[];
    await api('DELETE', `/api/admin/cards/${available[0]!.id}`);
    const refused = await api('POST', `/api/admin/orders/${orderId(second.order_no)}/confirm`);
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toMatch(/卡密不够/);
  });

  it('searches by phone or order number and saves notes', async () => {
    const id = (await api('POST', '/api/admin/products', baseProduct)).json().id as number;
    const placed = await placeOrder(id, 1, '13712345678');
    await placeOrder(id, 1, '13900139000');
    expect((await api('GET', '/api/admin/orders?q=345678')).json().total).toBe(1);
    expect((await api('GET', `/api/admin/orders?q=${placed.order_no.slice(-4).toLowerCase()}`)).json().items[0].order_no).toBe(
      placed.order_no,
    );
    const noted = await api('PUT', `/api/admin/orders/${orderId(placed.order_no)}/note`, { note: '已充值 Plus' });
    expect(noted.json().admin_note).toBe('已充值 Plus');
  });
});

describe('stats', () => {
  it('counts confirmed orders by Beijing day and product', async () => {
    const id = (await api('POST', '/api/admin/products', { ...baseProduct, stock: -1 })).json().id as number;
    const a = await placeOrder(id, 1);
    const b = await placeOrder(id, 2, '13900139000');
    await placeOrder(id, 1, '13700137000');
    await api('POST', `/api/admin/orders/${orderId(a.order_no)}/confirm`);
    await api('POST', `/api/admin/orders/${orderId(b.order_no)}/confirm`);

    const summary = (await api('GET', '/api/admin/stats/summary')).json();
    expect(summary.today).toEqual({ amount: 37500, orders: 2 });
    expect(summary.total).toEqual({ amount: 37500, orders: 2 });
    expect(summary.pending_orders).toBe(1);

    const daily = (await api('GET', '/api/admin/stats/daily?days=7')).json() as { amount: number }[];
    expect(daily).toHaveLength(7);
    expect(daily.at(-1)).toMatchObject({ amount: 37500, orders: 2 });

    const products = (await api('GET', '/api/admin/stats/products')).json();
    expect(products).toEqual([{ product_id: id, product_name: 'Plus', orders: 2, quantity: 3, amount: 37500 }]);
    expect((await api('GET', '/api/admin/stats/products?from=2026-13-01')).statusCode).toBe(400);
  });
});

describe('settings and uploads', () => {
  it('updates settings shown on the storefront', async () => {
    const saved = await api('PUT', '/api/admin/settings', { shop_name: '新店名', contact_wechat: 'wx-2', order_timeout_minutes: 30 });
    expect(saved.json()).toMatchObject({ shop_name: '新店名', order_timeout_minutes: 30 });
    expect((await app.inject('/api/shop')).json()).toMatchObject({ shop_name: '新店名', contact_wechat: 'wx-2' });
    expect((await api('PUT', '/api/admin/settings', { qr_wechat: 'https://x.example/qr.png' })).statusCode).toBe(400);
    expect((await api('PUT', '/api/admin/settings', { order_timeout_minutes: 1 })).statusCode).toBe(400);
  });

  function multipart(content: Buffer, filename: string) {
    const boundary = '----shop-test-boundary';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`),
      content,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return { body, contentType: `multipart/form-data; boundary=${boundary}` };
  }

  it('stores real images and rejects other files', async () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
    const ok = multipart(png, 'qr.png');
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/uploads',
      payload: ok.body,
      headers: { cookie, 'content-type': ok.contentType },
    });
    expect(res.statusCode).toBe(200);
    const url = res.json().url as string;
    expect(url).toMatch(/^\/uploads\/[0-9a-f-]+\.png$/);
    expect(fs.existsSync(path.join(uploadsDir, path.basename(url)))).toBe(true);

    const bad = multipart(Buffer.from('<script>alert(1)</script>'), 'qr.png');
    const rejected = await app.inject({
      method: 'POST',
      url: '/api/admin/uploads',
      payload: bad.body,
      headers: { cookie, 'content-type': bad.contentType },
    });
    expect(rejected.statusCode).toBe(400);
  });
});
