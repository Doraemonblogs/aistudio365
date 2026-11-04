import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { dailyBackup } from '../server/src/backup.js';
import { openDb } from '../server/src/db/index.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shop-backup-'));
  dirs.push(dir);
  const db = openDb(path.join(dir, 'shop.db'));
  db.prepare("INSERT INTO categories (name, sort, created_at) VALUES ('GPT', 0, 'now')").run();
  return { db, backups: path.join(dir, 'backups') };
}

describe('dailyBackup', () => {
  it('writes one readable copy per Beijing day', async () => {
    const { db, backups } = setup();
    // 17:00 UTC on 11-04 is already 11-05 in Beijing.
    const file = await dailyBackup(db, backups, 14, new Date('2026-11-04T17:00:00Z'));
    expect(path.basename(file ?? '')).toBe('shop-2026-11-05.db');
    expect(await dailyBackup(db, backups, 14, new Date('2026-11-05T09:00:00Z'))).toBeNull();

    const copy = new Database(file!, { readonly: true });
    expect(copy.prepare('SELECT name FROM categories').pluck().all()).toEqual(['GPT']);
    copy.close();
    db.close();
  });

  it('keeps only the newest copies and leaves other files alone', async () => {
    const { db, backups } = setup();
    fs.mkdirSync(backups);
    for (const day of ['2026-11-01', '2026-11-02', '2026-11-03']) fs.writeFileSync(path.join(backups, `shop-${day}.db`), '');
    fs.writeFileSync(path.join(backups, 'notes.txt'), '');

    await dailyBackup(db, backups, 2, new Date('2026-11-04T02:00:00Z'));
    expect(fs.readdirSync(backups).sort()).toEqual(['notes.txt', 'shop-2026-11-03.db', 'shop-2026-11-04.db']);
    db.close();
  });
});
