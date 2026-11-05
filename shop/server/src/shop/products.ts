import type { DB } from '../db/index.js';

export interface ProductRow {
  id: number;
  category_id: number | null;
  name: string;
  summary: string;
  description: string;
  instructions: string;
  price: number;
  original_price: number | null;
  image: string;
  qr_wechat: string;
  qr_alipay: string;
  stock: number;
  max_qty: number;
  card_mode: 'fixed' | 'pool';
  card_text: string;
  status: 'on' | 'off';
  sort: number;
  created_at: string;
  updated_at: string;
}

/** What the storefront shows: 库存充足 / 库存一般 / 仅剩少量 / 缺货. */
export type StockStatus = 'plenty' | 'medium' | 'low' | 'out';

/** 1 to LOW_STOCK units: 仅剩少量. Up to MEDIUM_STOCK: 库存一般. More, or unlimited: 库存充足. */
export const LOW_STOCK = 5;
export const MEDIUM_STOCK = 20;

export function getProduct(db: DB, id: number): ProductRow | undefined {
  return db.prepare('SELECT * FROM products WHERE id = ?').get(id) as ProductRow | undefined;
}

/** On-shelf products, in category order then product order. */
export function listOnShelf(db: DB, categoryId?: number): ProductRow[] {
  const byCategory = categoryId ? 'AND p.category_id = @categoryId' : '';
  return db
    .prepare(
      `SELECT p.* FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.status = 'on' ${byCategory}
        ORDER BY COALESCE(c.sort, 0) DESC, p.sort DESC, p.id`,
    )
    .all({ categoryId: categoryId ?? null }) as ProductRow[];
}

/**
 * Units that can still be ordered, or null when unlimited. Fixed-content products keep a stock
 * counter that orders take from when placed; card-pool products have as many units as unsold
 * cards, minus what pending orders are waiting on.
 */
export function availableStock(db: DB, product: ProductRow): number | null {
  if (product.card_mode === 'pool') {
    const row = db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM cards WHERE product_id = @id AND status = 'available')
              - (SELECT COALESCE(SUM(quantity), 0) FROM orders WHERE product_id = @id AND status = 'pending') AS n`,
      )
      .get({ id: product.id }) as { n: number };
    return Math.max(0, row.n);
  }
  return product.stock < 0 ? null : product.stock;
}

export function stockStatus(available: number | null): StockStatus {
  if (available === null || available > MEDIUM_STOCK) return 'plenty';
  if (available > LOW_STOCK) return 'medium';
  return available > 0 ? 'low' : 'out';
}
