import { randomInt } from 'node:crypto';
import type { DB } from '../db/index.js';
import { AppError } from '../errors.js';
import { nowIso } from '../time.js';

export type CouponKind = 'amount' | 'rate';

export interface CouponRow {
  id: number;
  code: string;
  name: string;
  /** 'amount': value cents off. 'rate': the buyer pays value percent (85 = 8.5 折). */
  kind: CouponKind;
  value: number;
  min_amount: number;
  /** JSON array of product ids; empty means every product. */
  product_ids: string;
  /** Only this phone may use it; '' means anyone who has the code. */
  phone: string;
  /** 0 means unlimited. */
  max_uses: number;
  starts_at: string | null;
  ends_at: string | null;
  status: 'on' | 'off';
  created_at: string;
}

/** An order that is not cancelled still holds its coupon. */
const HOLDING = "status IN ('pending', 'paid', 'completed')";

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/;

export const normalizeCode = (raw: string): string => String(raw ?? '').trim().toUpperCase();

/** A random code without look-alike characters (no 0/O, 1/I), e.g. VIP-7K3QX9MT. */
export function randomCode(prefix = '', length = 8): string {
  let tail = '';
  for (let i = 0; i < length; i++) tail += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return prefix ? `${prefix}-${tail}` : tail;
}

const yuan = (cents: number): string => {
  const value = cents / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
};

const beijingDay = (iso: string): string => new Date(Date.parse(iso) + 8 * 3_600_000).toISOString().slice(0, 10);

export function couponProductIds(coupon: Pick<CouponRow, 'product_ids'>): number[] {
  try {
    const value: unknown = JSON.parse(coupon.product_ids);
    return Array.isArray(value) ? value.filter((id): id is number => Number.isInteger(id)) : [];
  } catch {
    return [];
  }
}

/** What the coupon takes off a subtotal; never more than the subtotal. */
export function couponDiscount(coupon: Pick<CouponRow, 'kind' | 'value'>, subtotal: number): number {
  if (coupon.kind === 'amount') return Math.min(coupon.value, subtotal);
  return subtotal - Math.round((subtotal * coupon.value) / 100);
}

export function findCoupon(db: DB, code: string): CouponRow | undefined {
  return db.prepare('SELECT * FROM coupons WHERE code = ?').get(normalizeCode(code)) as CouponRow | undefined;
}

function usesOf(db: DB, couponId: number): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE coupon_id = ? AND ${HOLDING}`).get(couponId) as { n: number }).n;
}

function phoneUse(db: DB, couponId: number, phone: string) {
  return db
    .prepare(`SELECT order_no, status FROM orders WHERE coupon_id = ? AND phone = ? AND ${HOLDING} LIMIT 1`)
    .get(couponId, phone) as { order_no: string; status: string } | undefined;
}

export interface CouponQuote {
  coupon: CouponRow;
  subtotal: number;
  discount: number;
  amount: number;
}

/**
 * Checks that a code can be used on this purchase and works out the discount. Messages are for the
 * buyer. Called again inside the order transaction, so two orders can't both take the last use.
 */
export function quoteCoupon(
  db: DB,
  rawCode: string,
  input: { productId: number; subtotal: number; phone: string | null },
  now = nowIso(),
): CouponQuote {
  const coupon = findCoupon(db, rawCode);
  if (!coupon || coupon.status !== 'on') throw new AppError(404, '优惠券不存在或已停用，请检查券码');
  if (coupon.starts_at && now < coupon.starts_at) throw new AppError(400, `这张优惠券 ${beijingDay(coupon.starts_at)} 起才能用`);
  if (coupon.ends_at && now >= coupon.ends_at) throw new AppError(400, '这张优惠券已过期');
  if (coupon.phone && coupon.phone !== input.phone) {
    throw new AppError(400, input.phone ? '这张优惠券是发给其他手机号的，这个手机号不能用' : '请先填写领券时的手机号');
  }
  const products = couponProductIds(coupon);
  if (products.length > 0 && !products.includes(input.productId)) throw new AppError(400, '这张优惠券不能用于这个商品');
  if (input.subtotal < coupon.min_amount) throw new AppError(400, `满 ¥${yuan(coupon.min_amount)} 才能用这张优惠券`);
  if (input.phone) {
    const used = phoneUse(db, coupon.id, input.phone);
    if (used) {
      throw new AppError(
        409,
        used.status === 'pending'
          ? `这张优惠券已用在你的待付款订单 ${used.order_no} 上，付款或等它取消后再说`
          : '你已经用过这张优惠券了',
      );
    }
  }
  if (coupon.max_uses > 0 && usesOf(db, coupon.id) >= coupon.max_uses) {
    throw new AppError(409, coupon.max_uses === 1 ? '这张优惠券已经被使用了' : '这张优惠券已经被领完了');
  }
  const discount = couponDiscount(coupon, input.subtotal);
  return { coupon, subtotal: input.subtotal, discount, amount: input.subtotal - discount };
}

/** Coupons given to this phone that it can still use now, soonest to expire first. */
export function couponsForPhone(db: DB, phone: string, now = nowIso()): CouponRow[] {
  const rows = db
    .prepare(
      `SELECT * FROM coupons
        WHERE phone = @phone AND status = 'on'
          AND (starts_at IS NULL OR starts_at <= @now) AND (ends_at IS NULL OR ends_at > @now)
        ORDER BY ends_at IS NULL, ends_at, id`,
    )
    .all({ phone, now }) as CouponRow[];
  return rows.filter(
    (coupon) => !phoneUse(db, coupon.id, phone) && (coupon.max_uses === 0 || usesOf(db, coupon.id) < coupon.max_uses),
  );
}

export interface CouponTerms {
  name: string;
  kind: CouponKind;
  value: number;
  min_amount: number;
  product_ids: number[];
  starts_at: string | null;
  ends_at: string | null;
}

export interface CouponTarget {
  code: string;
  phone: string;
  max_uses: number;
}

/** Creates one coupon per target, all on the same terms; any clash and none are created. */
export function createCoupons(db: DB, terms: CouponTerms, targets: CouponTarget[]): CouponRow[] {
  if (terms.kind === 'rate' && (terms.value < 1 || terms.value > 99)) throw new AppError(400, '折扣要在 0.1 折到 9.9 折之间');
  if (terms.kind === 'amount' && terms.value < 1) throw new AppError(400, '优惠金额要大于 0');
  if (terms.starts_at && terms.ends_at && terms.ends_at <= terms.starts_at) throw new AppError(400, '结束日期要晚于开始日期');
  for (const id of terms.product_ids) {
    if (!db.prepare('SELECT 1 FROM products WHERE id = ?').get(id)) throw new AppError(400, '选择的商品不存在，请刷新后重试');
  }
  const insert = db.prepare(`
    INSERT INTO coupons (code, name, kind, value, min_amount, product_ids, phone, max_uses, starts_at, ends_at, created_at)
    VALUES (@code, @name, @kind, @value, @min_amount, @product_ids, @phone, @max_uses, @starts_at, @ends_at, @now)`);
  const now = nowIso();
  return db.transaction(() => {
    const created: CouponRow[] = [];
    for (const target of targets) {
      const code = normalizeCode(target.code);
      if (!CODE_PATTERN.test(code)) throw new AppError(400, `券码 ${code || '（空）'} 只能用字母、数字、- 和 _，3 到 32 位`);
      if (findCoupon(db, code)) throw new AppError(409, `券码 ${code} 已经存在，换一个吧`);
      const result = insert.run({
        ...terms,
        product_ids: JSON.stringify([...new Set(terms.product_ids)]),
        code,
        phone: target.phone,
        max_uses: target.max_uses,
        now,
      });
      created.push(db.prepare('SELECT * FROM coupons WHERE id = ?').get(Number(result.lastInsertRowid)) as CouponRow);
    }
    return created;
  })();
}

/** Fresh random codes that no coupon uses yet. */
export function freshCodes(db: DB, count: number, prefix = ''): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    const code = randomCode(prefix);
    if (!findCoupon(db, code)) codes.add(code);
  }
  return [...codes];
}

export type CouponState = 'active' | 'scheduled' | 'used' | 'expired' | 'off';

export interface CouponUse {
  order_no: string;
  phone: string;
  status: string;
  amount: number;
  discount: number;
  created_at: string;
}

/** Every coupon, newest first, with how it has been used. */
export function listCoupons(db: DB, now = nowIso()) {
  const coupons = db.prepare('SELECT * FROM coupons ORDER BY id DESC LIMIT 5000').all() as CouponRow[];
  const uses = new Map<number, CouponUse[]>();
  const rows = db
    .prepare(
      `SELECT coupon_id, order_no, phone, status, amount, discount, created_at FROM orders
        WHERE coupon_id IS NOT NULL AND ${HOLDING} ORDER BY created_at DESC`,
    )
    .all() as (CouponUse & { coupon_id: number })[];
  for (const { coupon_id, ...use } of rows) {
    const list = uses.get(coupon_id) ?? [];
    list.push(use);
    uses.set(coupon_id, list);
  }
  return coupons.map((coupon) => {
    const own = uses.get(coupon.id) ?? [];
    const used = own.filter((use) => use.status !== 'pending').length;
    const held = own.length - used;
    let state: CouponState = 'active';
    if (coupon.status === 'off') state = 'off';
    else if (coupon.max_uses > 0 && used >= coupon.max_uses) state = 'used';
    else if (coupon.ends_at && now >= coupon.ends_at) state = 'expired';
    else if (coupon.starts_at && now < coupon.starts_at) state = 'scheduled';
    return { ...coupon, product_ids: couponProductIds(coupon), used, held, state, uses: own.slice(0, 20) };
  });
}

/** Coupons any order still holds can only be switched off, not deleted. */
export function deleteCoupon(db: DB, id: number): void {
  const coupon = db.prepare('SELECT code FROM coupons WHERE id = ?').get(id) as { code: string } | undefined;
  if (!coupon) throw new AppError(404, '优惠券不存在');
  if (usesOf(db, id) > 0) throw new AppError(409, `券码 ${coupon.code} 已经用在订单上，不能删除，可以停用`);
  db.prepare('DELETE FROM coupons WHERE id = ?').run(id);
}
