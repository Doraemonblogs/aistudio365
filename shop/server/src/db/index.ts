import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { migrations } from './schema.js';

export type DB = Database.Database;

/** Opens (creating if needed) the shop database and brings its schema up to date. */
export function openDb(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

/** Applies every migration newer than PRAGMA user_version; returns the resulting version. */
export function migrate(db: DB): number {
  db.pragma('foreign_keys = ON');
  const current = Number(db.pragma('user_version', { simple: true }));
  for (let version = current; version < migrations.length; version++) {
    const sql = migrations[version];
    if (sql === undefined) break;
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${version + 1}`);
    })();
  }
  return Number(db.pragma('user_version', { simple: true }));
}
