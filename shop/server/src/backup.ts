import fs from 'node:fs';
import path from 'node:path';
import type { DB } from './db/index.js';
import { beijingDate } from './shop/stats.js';

const COPY_NAME = /^shop-\d{4}-\d{2}-\d{2}\.db$/;

/**
 * Keeps one copy of the database per Beijing day in `dir` (shop-YYYY-MM-DD.db) and deletes all
 * but the newest `keep` copies. Returns the file written, or null when today's copy already exists.
 * Safe to call as often as you like; the server calls it at start and every hour.
 */
export async function dailyBackup(db: DB, dir: string, keep: number, now = new Date()): Promise<string | null> {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `shop-${beijingDate(now)}.db`);
  let written: string | null = null;
  if (!fs.existsSync(file)) {
    // Write under a temporary name so a crash never leaves a half copy that looks complete.
    const partial = `${file}.partial`;
    fs.rmSync(partial, { force: true });
    await db.backup(partial);
    fs.renameSync(partial, file);
    written = file;
  }
  const copies = fs
    .readdirSync(dir)
    .filter((name) => COPY_NAME.test(name))
    .sort();
  for (const name of copies.slice(0, Math.max(0, copies.length - keep))) fs.rmSync(path.join(dir, name));
  return written;
}
