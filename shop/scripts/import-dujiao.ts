/**
 * Imports the catalog exported by export-dujiao.py into the shop database.
 *
 *   npm run import:dujiao -- <export dir> [--replace]
 *
 * <export dir> holds export.json and files/. Images are copied into DATA_DIR/uploads.
 * Refuses to run on a database that already has products unless --replace is given, and
 * --replace is refused once any order exists.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../server/src/config.js';
import { openDb } from '../server/src/db/index.js';
import { updateSettings } from '../server/src/settings.js';
import { nowIso } from '../server/src/time.js';

interface ExportProduct {
  slug: string;
  category: string | null;
  name: string;
  summary: string;
  description: string;
  instructions: string;
  price: number;
  stock: number;
  image: string;
  active: boolean;
  sort: number;
}

interface ExportFile {
  categories: { key: string; name: string; sort: number }[];
  products: ExportProduct[];
  settings: { shop_name: string; logo: string; notice: string };
  qr: { wechat?: string; alipay?: string };
}

// The wzyp shop showed ¥140 struck through on Plus; Dujiao-Next had no field for it.
const ORIGINAL_PRICES: Record<string, number> = { 'gpt-plus': 14000 };
// Contact details from the wzyp shop profile.
const CONTACT_WECHAT = 'aistudio361';
const CONTACT_QQ = '3090503843';
// Card content shown to buyers once payment is confirmed (owner's decision, 2026-11-04).
const CARD_TEXT = '请联系微信客服';
const DEFAULT_MAX_QTY = 10;

const args = process.argv.slice(2);
const exportDir = args.find((arg) => !arg.startsWith('--'));
const replace = args.includes('--replace');
if (!exportDir) {
  console.error('usage: npm run import:dujiao -- <export dir> [--replace]');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(path.join(exportDir, 'export.json'), 'utf8')) as ExportFile;
const config = loadConfig();
fs.mkdirSync(config.uploadsDir, { recursive: true });
const db = openDb(config.dbFile);

const counts = db
  .prepare('SELECT (SELECT COUNT(*) FROM products) AS products, (SELECT COUNT(*) FROM orders) AS orders')
  .get() as { products: number; orders: number };
if (counts.products > 0 && !replace) {
  console.error(`database already has ${counts.products} products; pass --replace to start over`);
  process.exit(1);
}
if (replace && counts.orders > 0) {
  console.error(`refusing --replace: the database has ${counts.orders} orders`);
  process.exit(1);
}

/** Copies an exported file into uploads and returns its public path (empty when absent). */
function importFile(name: string | undefined): string {
  if (!name) return '';
  const source = path.join(exportDir!, 'files', name);
  if (!fs.existsSync(source)) throw new Error(`missing exported file: ${name}`);
  fs.copyFileSync(source, path.join(config.uploadsDir, name));
  return `/uploads/${name}`;
}

const now = nowIso();
const insertCategory = db.prepare('INSERT INTO categories (name, sort, created_at) VALUES (?, ?, ?)');
const insertProduct = db.prepare(`
  INSERT INTO products (category_id, name, summary, description, instructions, price, original_price, image,
                        stock, max_qty, card_mode, card_text, status, sort, created_at, updated_at)
  VALUES (@category_id, @name, @summary, @description, @instructions, @price, @original_price, @image,
          @stock, @max_qty, 'fixed', @card_text, @status, @sort, @now, @now)`);

db.transaction(() => {
  if (replace) {
    db.exec('DELETE FROM cards; DELETE FROM products; DELETE FROM categories;');
  }
  const categoryIds = new Map<string, number>();
  for (const category of data.categories) {
    const result = insertCategory.run(category.name, category.sort, now);
    categoryIds.set(category.key, Number(result.lastInsertRowid));
  }
  for (const product of data.products) {
    insertProduct.run({
      category_id: product.category ? (categoryIds.get(product.category) ?? null) : null,
      name: product.name,
      summary: product.summary,
      description: product.description,
      instructions: product.instructions,
      price: product.price,
      original_price: ORIGINAL_PRICES[product.slug] ?? null,
      image: importFile(product.image),
      stock: product.stock,
      max_qty: DEFAULT_MAX_QTY,
      card_text: CARD_TEXT,
      status: product.active ? 'on' : 'off',
      sort: product.sort,
      now,
    });
  }
  updateSettings(db, {
    shop_name: data.settings.shop_name,
    logo: importFile(data.settings.logo),
    notice: data.settings.notice,
    contact_wechat: CONTACT_WECHAT,
    contact_qq: CONTACT_QQ,
    qr_wechat: importFile(data.qr.wechat),
    qr_alipay: importFile(data.qr.alipay),
  });
})();

console.log(`imported ${data.categories.length} categories and ${data.products.length} products into ${config.dbFile}`);
db.close();
