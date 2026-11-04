import type { DB } from '../db/index.js';
import { AppError } from '../errors.js';

/**
 * Sales figures. An order counts as a sale once payment is confirmed (paid or completed), on the
 * Beijing date of paid_at. Days, weeks (from Monday) and months are Beijing calendar periods.
 */
const BEIJING_MS = 8 * 3_600_000;
const DAY_MS = 24 * 3_600_000;
const SOLD = "status IN ('paid', 'completed')";

export interface SalesFigure {
  amount: number;
  orders: number;
}

/** Start of the Beijing day containing `now`, as a UTC Date. */
function beijingDayStart(now: Date): Date {
  const local = new Date(now.getTime() + BEIJING_MS);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - BEIJING_MS);
}

/** 'YYYY-MM-DD' (Beijing) of a UTC Date. */
export function beijingDate(date: Date): string {
  return new Date(date.getTime() + BEIJING_MS).toISOString().slice(0, 10);
}

/** UTC ISO instant of 00:00 Beijing on a 'YYYY-MM-DD' date. */
export function beijingDateStart(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00+08:00`))) {
    throw new AppError(400, '日期格式不正确');
  }
  return new Date(Date.parse(`${date}T00:00:00+08:00`)).toISOString();
}

function salesSince(db: DB, since: string | null): SalesFigure {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(amount), 0) AS amount FROM orders
        WHERE ${SOLD} ${since ? 'AND paid_at >= @since' : ''}`,
    )
    .get({ since }) as SalesFigure;
  return { amount: row.amount, orders: row.orders };
}

export function salesSummary(db: DB, now = new Date()) {
  const today = beijingDayStart(now);
  const local = new Date(today.getTime() + BEIJING_MS);
  const weekStart = new Date(today.getTime() - ((local.getUTCDay() + 6) % 7) * DAY_MS);
  const monthStart = new Date(today.getTime() - (local.getUTCDate() - 1) * DAY_MS);
  const pending = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'pending'").get() as { n: number };
  const toShip = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'paid'").get() as { n: number };
  return {
    today: salesSince(db, today.toISOString()),
    week: salesSince(db, weekStart.toISOString()),
    month: salesSince(db, monthStart.toISOString()),
    total: salesSince(db, null),
    pending_orders: pending.n,
    paid_orders: toShip.n,
  };
}

/** One row per Beijing day for the last `days` days, oldest first, zero-filled. */
export function dailySales(db: DB, days: number, now = new Date()): (SalesFigure & { date: string })[] {
  const first = new Date(beijingDayStart(now).getTime() - (days - 1) * DAY_MS);
  const rows = db
    .prepare(
      `SELECT date(paid_at, '+8 hours') AS date, COUNT(*) AS orders, COALESCE(SUM(amount), 0) AS amount
         FROM orders WHERE ${SOLD} AND paid_at >= ? GROUP BY date(paid_at, '+8 hours')`,
    )
    .all(first.toISOString()) as (SalesFigure & { date: string })[];
  const byDate = new Map(rows.map((row) => [row.date, row]));
  return Array.from({ length: days }, (_, i) => {
    const date = beijingDate(new Date(first.getTime() + i * DAY_MS));
    const row = byDate.get(date);
    return { date, amount: row?.amount ?? 0, orders: row?.orders ?? 0 };
  });
}

/** Sales per product between two Beijing dates (inclusive), biggest first. */
export function productSales(db: DB, from: string, to: string) {
  const start = beijingDateStart(from);
  const end = new Date(Date.parse(beijingDateStart(to)) + DAY_MS).toISOString();
  if (start >= end) throw new AppError(400, '开始日期不能晚于结束日期');
  return db
    .prepare(
      `SELECT product_id, product_name, COUNT(*) AS orders, SUM(quantity) AS quantity, SUM(amount) AS amount
         FROM orders WHERE ${SOLD} AND paid_at >= ? AND paid_at < ?
        GROUP BY product_id, product_name ORDER BY amount DESC, quantity DESC`,
    )
    .all(start, end) as { product_id: number | null; product_name: string; orders: number; quantity: number; amount: number }[];
}
