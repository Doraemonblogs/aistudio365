import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../server/src/app.js';
import { openDb, type DB } from '../server/src/db/index.js';
import { hashPassword } from '../server/src/passwords.js';
import { updateSettings } from '../server/src/settings.js';
import { expireOrders } from '../server/src/shop/orders.js';

let db: DB;
let app: FastifyInstance;
let uploadsDir: string;
let cookie: string;
let plus: number;
let gmail: number;
let ipCounter = 0;

const PASSWORD = 'test-password-1';
const ip = () => `7.7.${Math.floor(ipCounter / 250)}.${ipCounter++ % 250}`;

function sessionCookie(res: LightMyRequestResponse): string {
  const header = res.headers['set-cookie'];
  return String(Array.isArray(header) ? header[0] : header).split(';')[0]!;
}

const api = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
  app.inject({ method, url, payload: payload as Record<string, unknown> | undefined, headers: { cookie } });

const buyer = (method: 'GET' | 'POST', url: string, payload?: unknown) =>
  app.inject({ method, url, payload: payload as Record<string, unknown> | undefined, headers: { 'x-forwarded-for': ip() } });

const order = (extra: Record<string, unknown>) =>
  buyer('POST', '/api/orders', { product_id: plus, quantity: 1, phone: '13800138000', pay_method: 'alipay', ...extra });

const createCoupons = async (body: Record<string, unknown>) => {
  const res = await api('POST', '/api/admin/coupons', { kind: 'amount', value: 2000, mode: 'code', ...body });
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as { created: number; ids: number[] };
};

type Listed = { id: number; code: string; phone: string; state: string; used: number; held: number; max_uses: number; uses: { order_no: string }[] };
const coupons = async () => (await api('GET', '/api/admin/coupons')).json() as Listed[];

const day = (offset: number) => new Date(Date.now() + 8 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10);

beforeEach(async () => {
  uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shop-marketing-'));
  db = openDb(':memory:');
  db.prepare("INSERT INTO admins (username, password_hash, created_at) VALUES ('admin', ?, 'now')").run(await hashPassword(PASSWORD));
  app = buildApp(db, { uploadsDir, logger: false, cookieSecure: false });
  await app.ready();
  cookie = sessionCookie(
    await app.inject({ method: 'POST', url: '/api/admin/login', payload: { username: 'admin', password: PASSWORD } }),
  );
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO products (name, price, qr_alipay, stock, max_qty, card_text, created_at, updated_at)
    VALUES (?, ?, ?, 10, 5, '请联系微信客服', ?, ?)`);
  plus = Number(insert.run('Plus', 12500, '/uploads/plus-125.jpg', now, now).lastInsertRowid);
  gmail = Number(insert.run('Gmail', 2800, '', now, now).lastInsertRowid);
  updateSettings(db, { qr_wechat: '/uploads/qr-wechat.png', qr_alipay: '/uploads/qr-alipay.jpg' });
});

afterEach(async () => {
  await app.close();
  db.close();
  fs.rmSync(uploadsDir, { recursive: true, force: true });
});

describe('batch order actions', () => {
  const place = async (phone: string) => (await order({ phone })).json() as { order_no: string };
  const idOf = (orderNo: string) => (db.prepare('SELECT id FROM orders WHERE order_no = ?').get(orderNo) as { id: number }).id;
  const statusOf = (id: number) => (db.prepare('SELECT status FROM orders WHERE id = ?').get(id) as { status: string } | undefined)?.status;

  it('confirms, completes, cancels and deletes many orders, reporting the ones that do not fit', async () => {
    const ids = [];
    for (const phone of ['13800000001', '13800000002', '13800000003']) ids.push(idOf((await place(phone)).order_no));
    const [a, b, c] = ids as [number, number, number];

    let res = await api('POST', '/api/admin/orders/batch', { action: 'confirm', ids: [a, b] });
    expect(res.json()).toEqual({ done: 2, failed: [] });

    // c is still pending, so it can't be completed; a and b can.
    res = await api('POST', '/api/admin/orders/batch', { action: 'complete', ids: [a, b, c] });
    expect(res.json()).toMatchObject({ done: 2, failed: [{ id: c, error: '只有已付款的订单可以标记完成' }] });
    expect([statusOf(a), statusOf(b), statusOf(c)]).toEqual(['completed', 'completed', 'pending']);

    res = await api('POST', '/api/admin/orders/batch', { action: 'cancel', ids: [c] });
    expect(res.json()).toEqual({ done: 1, failed: [] });

    // Only cancelled orders can be deleted; completed ones stay for the books.
    res = await api('POST', '/api/admin/orders/batch', { action: 'delete', ids: [a, c] });
    expect(res.json()).toMatchObject({ done: 1, failed: [{ id: a, error: '只有已取消的订单可以删除' }] });
    expect(statusOf(c)).toBeUndefined();
    expect(statusOf(a)).toBe('completed');
  });

  it('gives cancelled stock back when orders are cancelled in a batch', async () => {
    const first = idOf((await place('13800000004')).order_no);
    const second = idOf((await place('13800000005')).order_no);
    const stock = () => (db.prepare('SELECT stock FROM products WHERE id = ?').get(plus) as { stock: number }).stock;
    expect(stock()).toBe(8);
    await api('POST', '/api/admin/orders/batch', { action: 'cancel', ids: [first, second] });
    expect(stock()).toBe(10);
  });

  it('needs a signed-in admin', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/admin/orders/batch', payload: { action: 'delete', ids: [1] } });
    expect(res.statusCode).toBe(401);
  });
});

describe('creating coupons', () => {
  it('makes one shared code, single-use codes, or one code per phone', async () => {
    await createCoupons({ name: '双十一', code: 'double11', max_uses: 100 });
    await createCoupons({ name: '一次性', mode: 'codes', count: 3, prefix: 'vip' });
    await createCoupons({ name: '老客', mode: 'phones', phones: ['138 0013 8000', '+86 139-0013-9000', '13800138000'] });

    const list = await coupons();
    expect(list).toHaveLength(6);
    expect(list.find((c) => c.code === 'DOUBLE11')).toMatchObject({ max_uses: 100, phone: '', state: 'active' });
    const vip = list.filter((c) => c.code.startsWith('VIP-'));
    expect(vip).toHaveLength(3);
    expect(vip.every((c) => c.max_uses === 1 && /^VIP-[A-HJ-NP-Z2-9]{8}$/.test(c.code))).toBe(true);
    // The repeated phone gets one coupon, not two.
    expect(list.filter((c) => c.phone).map((c) => c.phone).sort()).toEqual(['13800138000', '13900139000']);
  });

  it('refuses a taken code, a bad phone, a bad rate and a backwards date range', async () => {
    await createCoupons({ code: 'TAKEN' });
    expect((await api('POST', '/api/admin/coupons', { kind: 'amount', value: 100, mode: 'code', code: 'taken' })).json().error).toMatch(
      '已经存在',
    );
    expect(
      (await api('POST', '/api/admin/coupons', { kind: 'amount', value: 100, mode: 'phones', phones: ['12345'] })).json().error,
    ).toMatch('手机号不对');
    expect((await api('POST', '/api/admin/coupons', { kind: 'rate', value: 100, mode: 'code' })).statusCode).toBe(400);
    expect(
      (await api('POST', '/api/admin/coupons', { kind: 'amount', value: 100, mode: 'code', starts_on: day(3), ends_on: day(1) })).json().error,
    ).toMatch('结束日期');
  });
});

describe('using coupons', () => {
  const check = (code: string, extra: Record<string, unknown> = {}) =>
    buyer('POST', '/api/coupons/check', { code, product_id: plus, quantity: 1, phone: '13800138000', ...extra });

  it('takes a fixed amount or a rate off, and the order keeps the discount', async () => {
    await createCoupons({ code: 'MINUS20', value: 2000, max_uses: 0 });
    await createCoupons({ code: 'OFF85', kind: 'rate', value: 85, max_uses: 0 });

    expect((await check('minus20')).json()).toMatchObject({ code: 'MINUS20', subtotal: 12500, discount: 2000, amount: 10500 });
    expect((await check('OFF85', { quantity: 2 })).json()).toMatchObject({ subtotal: 25000, discount: 3750, amount: 21250 });

    const placed = await order({ coupon_code: ' minus20 ' });
    expect(placed.statusCode).toBe(201);
    // A discounted order can't use the product's fixed-amount code.
    expect(placed.json()).toMatchObject({
      amount: 10500,
      discount: 2000,
      coupon_code: 'MINUS20',
      qr: { url: '/uploads/qr-alipay.jpg', fixed_amount: false },
    });
  });

  it('never charges below zero', async () => {
    await createCoupons({ code: 'FREE', value: 50_000 });
    expect((await order({ coupon_code: 'FREE' })).json()).toMatchObject({ amount: 0, discount: 12500 });
  });

  it('respects the threshold, the products, the dates and switching off', async () => {
    await createCoupons({ code: 'OVER200', min_amount: 20_000 });
    await createCoupons({ code: 'GMAILONLY', product_ids: [gmail] });
    await createCoupons({ code: 'LATER', starts_on: day(2) });
    await createCoupons({ code: 'GONE', starts_on: day(-5), ends_on: day(-1) });
    const { ids } = await createCoupons({ code: 'OFF' });
    await api('POST', '/api/admin/coupons/batch', { action: 'disable', ids });

    expect((await check('OVER200')).json().error).toBe('满 ¥200 才能用这张优惠券');
    expect((await check('OVER200', { quantity: 2 })).statusCode).toBe(200);
    expect((await check('GMAILONLY')).json().error).toBe('这张优惠券不能用于这个商品');
    expect((await check('LATER')).json().error).toMatch('起才能用');
    expect((await check('GONE')).json().error).toBe('这张优惠券已过期');
    expect((await check('OFF')).json().error).toMatch('不存在或已停用');
    expect((await check('NOPE')).statusCode).toBe(404);
    // The order itself is checked too, not just the preview.
    expect((await order({ coupon_code: 'GMAILONLY' })).statusCode).toBe(400);

    const states = Object.fromEntries((await coupons()).map((c) => [c.code, c.state]));
    expect(states).toMatchObject({ LATER: 'scheduled', GONE: 'expired', OFF: 'off', OVER200: 'active' });
  });

  it('a phone coupon works only for its phone and shows up for it', async () => {
    await createCoupons({ name: '老客', mode: 'phones', phones: ['13900139000'] });
    const [coupon] = await coupons();
    expect((await check(coupon!.code)).json().error).toMatch('发给其他手机号');
    expect((await check(coupon!.code, { phone: undefined })).json().error).toMatch('请先填写');
    expect((await check(coupon!.code, { phone: '13900139000' })).statusCode).toBe(200);

    const mine = (await buyer('GET', '/api/coupons?phone=13900139000')).json() as { code: string }[];
    expect(mine.map((c) => c.code)).toEqual([coupon!.code]);
    expect((await buyer('GET', '/api/coupons?phone=13800138000')).json()).toEqual([]);
  });

  it('a single-use code is held by a pending order, freed if it is cancelled, and spent once paid', async () => {
    const { ids } = await createCoupons({ mode: 'codes', count: 1 });
    const [{ code }] = (await coupons()) as [Listed];

    const first = (await order({ coupon_code: code })).json() as { order_no: string };
    expect((await check(code)).json().error).toMatch(`待付款订单 ${first.order_no}`);
    expect((await check(code, { phone: '13900139000' })).json().error).toBe('这张优惠券已经被使用了');
    expect((await coupons())[0]).toMatchObject({ held: 1, used: 0, state: 'active' });

    // The order runs out of time: the code is free again.
    db.prepare("UPDATE orders SET expire_at = '2000-01-01T00:00:00.000Z' WHERE order_no = ?").run(first.order_no);
    expireOrders(db);
    expect((await check(code, { phone: '13900139000' })).statusCode).toBe(200);

    const second = (await order({ coupon_code: code, phone: '13900139000' })).json() as { order_no: string };
    await buyer('POST', `/api/orders/${second.order_no}/paid`, { phone: '13900139000' });
    const [listed] = await coupons();
    expect(listed).toMatchObject({ used: 1, held: 0, state: 'used', uses: [{ order_no: second.order_no }] });

    // A used coupon can be switched off but not deleted.
    const res = await api('POST', '/api/admin/coupons/batch', { action: 'delete', ids });
    expect(res.json()).toMatchObject({ done: 0, failed: [{ error: expect.stringContaining('不能删除') }] });
  });

  it('lets each phone use a shared code once, up to its limit', async () => {
    await createCoupons({ code: 'TWICE', max_uses: 2 });
    expect((await order({ coupon_code: 'TWICE', phone: '13800000001' })).statusCode).toBe(201);
    expect((await order({ coupon_code: 'TWICE', phone: '13800000001' })).json().error).toMatch('待付款订单');
    expect((await order({ coupon_code: 'TWICE', phone: '13800000002' })).statusCode).toBe(201);
    expect((await order({ coupon_code: 'TWICE', phone: '13800000003' })).json().error).toBe('这张优惠券已经被领完了');
  });
});
