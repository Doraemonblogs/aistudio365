import { randomInt } from 'node:crypto';
import Database from 'better-sqlite3';
import type { DB } from '../db/index.js';
import { AppError } from '../errors.js';
import { addMinutes, nowIso } from '../time.js';
import { quoteCoupon } from './coupons.js';
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
  coupon_id: number | null;
  coupon_code: string;
  /** Cents the coupon took off; amount = unit_price × quantity − discount. */
  discount: number;
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
  couponCode?: string;
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
      throw new AppError(409, available === 0 ? '该商品暂时缺货' : `库存不足，最多还能买 ${available} 件`);
    }

    const pending = db
      .prepare("SELECT COUNT(*) AS n FROM orders WHERE phone = ? AND status = 'pending'")
      .get(input.phone) as { n: number };
    if (pending.n >= MAX_PENDING_PER_PHONE) {
      throw new AppError(429, `你已有 ${MAX_PENDING_PER_PHONE} 笔待付款订单，请先完成付款，或等它们自动取消后再下单`);
    }

    const subtotal = product.price * input.quantity;
    const quote = input.couponCode?.trim()
      ? quoteCoupon(db, input.couponCode, { productId: product.id, subtotal })
      : null;

    if (product.card_mode === 'fixed' && product.stock >= 0) {
      const taken = db
        .prepare('UPDATE products SET stock = stock - @qty WHERE id = @id AND stock >= @qty')
        .run({ id: product.id, qty: input.quantity });
      if (taken.changes !== 1) throw new AppError(409, '库存不足');
    }

    const createdAt = nowIso();
    const insert = db.prepare(`
      INSERT INTO orders (order_no, phone, product_id, product_name, unit_price, quantity, amount, pay_method,
                          status, client_ip, created_at, expire_at, coupon_id, coupon_code, discount)
      VALUES (@order_no, @phone, @product_id, @product_name, @unit_price, @quantity, @amount, @pay_method,
              'pending', @client_ip, @created_at, @expire_at, @coupon_id, @coupon_code, @discount)`);
    for (let attempt = 1; ; attempt++) {
      try {
        const result = insert.run({
          order_no: newOrderNo(),
          phone: input.phone,
          product_id: product.id,
          product_name: product.name,
          unit_price: product.price,
          quantity: input.quantity,
          amount: quote ? quote.amount : subtotal,
          pay_method: input.payMethod,
          client_ip: input.clientIp,
          created_at: createdAt,
          expire_at: addMinutes(createdAt, timeoutMinutes),
          coupon_id: quote?.coupon.id ?? null,
          coupon_code: quote?.coupon.code ?? '',
          discount: quote?.discount ?? 0,
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

/** Cancels one pending order and releases its stock; false when it was not pending. */
function cancelIfPending(db: DB, order: Pick<OrderRow, 'id' | 'product_id' | 'quantity'>, now: string): boolean {
  const changed = db
    .prepare("UPDATE orders SET status = 'cancelled', cancelled_at = @now WHERE id = @id AND status = 'pending'")
    .run({ id: order.id, now }).changes;
  if (changed === 1) releaseStock(db, order.product_id, order.quantity);
  return changed === 1;
}

/** Cancels every pending order past its deadline and releases its stock; returns how many. */
export function expireOrders(db: DB, now = nowIso()): number {
  const expired = db
    .prepare("SELECT id, product_id, quantity FROM orders WHERE status = 'pending' AND expire_at <= ?")
    .all(now) as Pick<OrderRow, 'id' | 'product_id' | 'quantity'>[];
  if (expired.length === 0) return 0;
  let count = 0;
  db.transaction(() => {
    for (const order of expired) if (cancelIfPending(db, order, now)) count++;
  })();
  return count;
}

function requireOrder(db: DB, id: number): OrderRow {
  const order = getOrder(db, id);
  if (!order) throw new AppError(404, '订单不存在');
  return order;
}

/**
 * The order becomes paid and its cards are handed out. Fixed-content products deliver their
 * text; card-pool products take that many unsold cards. Customer service can also confirm a
 * cancelled order (the buyer paid after the deadline); its released stock is taken again, never
 * below zero.
 */
export function confirmPayment(db: DB, id: number, now = nowIso()): OrderRow {
  return db.transaction(() => {
    const order = requireOrder(db, id);
    if (order.status !== 'pending' && order.status !== 'cancelled') {
      throw new AppError(409, '只有待付款或已取消的订单可以确认收款');
    }
    const product = order.product_id === null ? undefined : getProduct(db, order.product_id);
    let cards: string[] = [];
    if (product?.card_mode === 'pool') {
      const rows = db
        .prepare("SELECT id, content FROM cards WHERE product_id = ? AND status = 'available' ORDER BY id LIMIT ?")
        .all(product.id, order.quantity) as { id: number; content: string }[];
      if (rows.length < order.quantity) {
        throw new AppError(409, `卡密不够：这单需要 ${order.quantity} 张，卡密库只剩 ${rows.length} 张，请先补充卡密`);
      }
      const sell = db.prepare("UPDATE cards SET status = 'sold', order_id = ?, sold_at = ? WHERE id = ?");
      for (const row of rows) sell.run(order.id, now, row.id);
      cards = rows.map((row) => row.content);
    } else if (product) {
      if (product.card_text.trim()) cards = [product.card_text.trim()];
      if (order.status === 'cancelled' && product.stock >= 0) {
        db.prepare('UPDATE products SET stock = MAX(stock - ?, 0) WHERE id = ?').run(order.quantity, product.id);
      }
    }
    db.prepare(
      "UPDATE orders SET status = 'paid', paid_at = ?, cancelled_at = NULL, cards = ? WHERE id = ?",
    ).run(now, JSON.stringify(cards), order.id);
    return getOrder(db, order.id)!;
  })();
}

/**
 * The buyer says they have paid. It is taken on trust so the cards show at once; customer service
 * can void the order with cancelOrder if the money never arrives. Repeating it is harmless.
 */
export function buyerConfirmPayment(db: DB, order: OrderRow, now = nowIso()): OrderRow {
  if (order.status === 'paid' || order.status === 'completed') return order;
  if (order.status !== 'pending') throw new AppError(409, '订单已取消。如果你已经付过款，请联系客服处理');
  try {
    return confirmPayment(db, order.id, now);
  } catch (error) {
    // Only a card pool that ran dry gets here; the buyer can't fix that, customer service can.
    if (error instanceof AppError && error.statusCode === 409) throw new AppError(409, '卡密暂时不够，请联系客服处理');
    throw error;
  }
}

export function completeOrder(db: DB, id: number, now = nowIso()): OrderRow {
  const order = requireOrder(db, id);
  if (order.status !== 'paid') throw new AppError(409, '只有已付款的订单可以标记完成');
  db.prepare("UPDATE orders SET status = 'completed', completed_at = ? WHERE id = ?").run(now, id);
  return getOrder(db, id)!;
}

/**
 * Cancels a pending order, or voids a paid one whose money never arrived (buyers mark orders paid
 * themselves). Fixed-content stock goes back either way. Pool cards of a voided order stay sold:
 * the buyer has already seen them.
 */
export function cancelOrder(db: DB, id: number, now = nowIso()): OrderRow {
  return db.transaction(() => {
    const order = requireOrder(db, id);
    if (order.status === 'paid') {
      db.prepare("UPDATE orders SET status = 'cancelled', cancelled_at = ?, paid_at = NULL WHERE id = ?").run(now, id);
      releaseStock(db, order.product_id, order.quantity);
    } else if (!cancelIfPending(db, order, now)) {
      throw new AppError(409, '只有待付款或已付款的订单可以取消');
    }
    return getOrder(db, id)!;
  })();
}

/** Removes a cancelled order for good (test orders, spam). Other orders are kept for the books. */
export function deleteOrder(db: DB, id: number): void {
  const order = requireOrder(db, id);
  if (order.status !== 'cancelled') throw new AppError(409, '只有已取消的订单可以删除');
  db.prepare('DELETE FROM orders WHERE id = ?').run(id);
}

export type BatchAction = 'confirm' | 'complete' | 'cancel' | 'delete';

/** Runs one action over many orders; each order succeeds or fails on its own. */
export function batchOrders(db: DB, action: BatchAction, ids: number[], now = nowIso()) {
  const failed: { id: number; order_no: string; error: string }[] = [];
  let done = 0;
  for (const id of [...new Set(ids)]) {
    try {
      if (action === 'confirm') confirmPayment(db, id, now);
      else if (action === 'complete') completeOrder(db, id, now);
      else if (action === 'cancel') cancelOrder(db, id, now);
      else deleteOrder(db, id);
      done++;
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      failed.push({ id, order_no: getOrder(db, id)?.order_no ?? '', error: error.message });
    }
  }
  return { done, failed };
}

export function setOrderNote(db: DB, id: number, note: string): OrderRow {
  requireOrder(db, id);
  db.prepare('UPDATE orders SET admin_note = ? WHERE id = ?').run(note, id);
  return getOrder(db, id)!;
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
