import { randomInt } from 'node:crypto';
import Database from 'better-sqlite3';
import type { DB } from '../db/index.js';
import { AppError } from '../errors.js';
import { addMinutes, nowIso } from '../time.js';
import { availableStock, getProduct } from './products.js';

export type OrderStatus = 'pending' | 'paid' | 'completed' | 'cancelled';
export type PayMethod = 'wechat' | 'alipay';

export interface OrderRow {
  id: number;
  order_no: string;
  phone: string;
  product_id: number | null;
  product_name: string;
  unit_price: number;
  quantity: number;
  amount: number;
  pay_method: PayMethod;
  status: OrderStatus;
  cards: string;
  admin_note: string;
  client_ip: string;
  created_at: string;
  expire_at: string;
  paid_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
}

/** A buyer may have this many unpaid orders at once. */
export const MAX_PENDING_PER_PHONE = 3;

const ORDER_NO_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Short order number a buyer can read out: A + Beijing MMDD + 4 random characters, e.g. A1104-7K3Q. */
export function newOrderNo(now = new Date()): string {
  const beijing = new Date(now.getTime() + 8 * 3_600_000);
  const mmdd = `${String(beijing.getUTCMonth() + 1).padStart(2, '0')}${String(beijing.getUTCDate()).padStart(2, '0')}`;
  let tail = '';
  for (let i = 0; i < 4; i++) tail += ORDER_NO_ALPHABET[randomInt(ORDER_NO_ALPHABET.length)];
  return `A${mmdd}-${tail}`;
}

export interface CreateOrderInput {
  productId: number;
  quantity: number;
  phone: string;
  payMethod: PayMethod;
  clientIp: string;
}

export function getOrder(db: DB, id: number): OrderRow | undefined {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as OrderRow | undefined;
}

/** Places a pending order and holds its stock until it is paid or cancelled. */
export function createOrder(db: DB, input: CreateOrderInput, timeoutMinutes: number): OrderRow {
  return db.transaction(() => {
    const product = getProduct(db, input.productId);
    if (!product || product.status !== 'on') throw new AppError(404, '商品不存在或已下架');
    if (!Number.isInteger(input.quantity) || input.quantity < 1) throw new AppError(400, '购买数量不正确');
    if (input.quantity > product.max_qty) throw new AppError(400, `每单最多购买 ${product.max_qty} 件`);

    const available = availableStock(db, product);
    if (available !== null && available < input.quantity) {
      throw new AppError(409, available === 0 ? '该商品已售罄' : `库存不足，最多还能买 ${available} 件`);
    }

    const pending = db
      .prepare("SELECT COUNT(*) AS n FROM orders WHERE phone = ? AND status = 'pending'")
      .get(input.phone) as { n: number };
    if (pending.n >= MAX_PENDING_PER_PHONE) {
      throw new AppError(429, `你已有 ${MAX_PENDING_PER_PHONE} 笔待付款订单，请先完成付款，或等它们自动取消后再下单`);
    }

    if (product.card_mode === 'fixed' && product.stock >= 0) {
      const taken = db
        .prepare('UPDATE products SET stock = stock - @qty WHERE id = @id AND stock >= @qty')
        .run({ id: product.id, qty: input.quantity });
      if (taken.changes !== 1) throw new AppError(409, '库存不足');
    }

    const createdAt = nowIso();
    const insert = db.prepare(`
      INSERT INTO orders (order_no, phone, product_id, product_name, unit_price, quantity, amount, pay_method,
                          status, client_ip, created_at, expire_at)
      VALUES (@order_no, @phone, @product_id, @product_name, @unit_price, @quantity, @amount, @pay_method,
              'pending', @client_ip, @created_at, @expire_at)`);
    for (let attempt = 1; ; attempt++) {
      try {
        const result = insert.run({
          order_no: newOrderNo(),
          phone: input.phone,
          product_id: product.id,
          product_name: product.name,
          unit_price: product.price,
          quantity: input.quantity,
          amount: product.price * input.quantity,
          pay_method: input.payMethod,
          client_ip: input.clientIp,
          created_at: createdAt,
          expire_at: addMinutes(createdAt, timeoutMinutes),
        });
        return getOrder(db, Number(result.lastInsertRowid))!;
      } catch (error) {
        const duplicate = error instanceof Database.SqliteError && error.code === 'SQLITE_CONSTRAINT_UNIQUE';
        if (!duplicate || attempt >= 8) throw error;
      }
    }
  })();
}

/** Gives held stock back to a fixed-content product with a limited stock counter. */
function releaseStock(db: DB, productId: number | null, quantity: number): void {
  if (productId === null) return;
  db.prepare(
    "UPDATE products SET stock = stock + @qty WHERE id = @id AND card_mode = 'fixed' AND stock >= 0",
  ).run({ id: productId, qty: quantity });
}

/** Cancels every pending order past its deadline and releases its stock; returns how many. */
export function expireOrders(db: DB, now = nowIso()): number {
  const expired = db
    .prepare("SELECT id, product_id, quantity FROM orders WHERE status = 'pending' AND expire_at <= ?")
    .all(now) as Pick<OrderRow, 'id' | 'product_id' | 'quantity'>[];
  if (expired.length === 0) return 0;
  const cancel = db.prepare(
    "UPDATE orders SET status = 'cancelled', cancelled_at = @now WHERE id = @id AND status = 'pending'",
  );
  db.transaction(() => {
    for (const order of expired) {
      if (cancel.run({ id: order.id, now }).changes === 1) releaseStock(db, order.product_id, order.quantity);
    }
  })();
  return expired.length;
}

export function findBuyerOrder(db: DB, orderNo: string, phone: string): OrderRow | undefined {
  return db.prepare('SELECT * FROM orders WHERE order_no = ? AND phone = ?').get(orderNo, phone) as
    | OrderRow
    | undefined;
}

export function listBuyerOrders(db: DB, phone: string, limit = 50): OrderRow[] {
  return db
    .prepare('SELECT * FROM orders WHERE phone = ? ORDER BY created_at DESC, id DESC LIMIT ?')
    .all(phone, limit) as OrderRow[];
}

export function parseCards(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}
