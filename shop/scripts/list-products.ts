/** Prints the catalog as a table: npm run products:list */
import { loadConfig } from '../server/src/config.js';
import { openDb } from '../server/src/db/index.js';
import { getSettings } from '../server/src/settings.js';

const db = openDb(loadConfig().dbFile);
const yuan = (cents: number | null) => (cents === null ? '' : `¥${(cents / 100).toFixed(2)}`);

const rows = db
  .prepare(
    `SELECT p.id, c.name AS category, p.name, p.price, p.original_price, p.stock, p.max_qty,
            p.card_mode, p.card_text, p.status, p.image
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
      ORDER BY c.sort DESC, p.sort DESC, p.id`,
  )
  .all() as {
  id: number;
  category: string | null;
  name: string;
  price: number;
  original_price: number | null;
  stock: number;
  max_qty: number;
  card_mode: string;
  card_text: string;
  status: string;
  image: string;
}[];

console.table(
  rows.map((r) => ({
    id: r.id,
    category: r.category ?? '',
    name: r.name,
    price: yuan(r.price),
    was: yuan(r.original_price),
    stock: r.stock === -1 ? 'unlimited' : r.stock,
    max_qty: r.max_qty,
    card: r.card_mode === 'fixed' ? r.card_text : 'card pool',
    status: r.status,
    image: r.image ? 'yes' : 'no',
  })),
);

const settings = getSettings(db);
console.log({
  ...settings,
  notice: settings.notice ? `${settings.notice.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)}…` : '',
});
db.close();
