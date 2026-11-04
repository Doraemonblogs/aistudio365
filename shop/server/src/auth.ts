import { createHash, randomBytes } from 'node:crypto';
import type { DB } from './db/index.js';
import { nowIso } from './time.js';

export const SESSION_COOKIE = 'shop_admin';
export const SESSION_TTL_MS = 7 * 24 * 3_600_000;

export interface AdminRow {
  id: number;
  username: string;
  password_hash: string;
  last_login_at: string | null;
  created_at: string;
}

export interface SessionAdmin {
  id: number;
  username: string;
}

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export function createSession(db: DB, adminId: number, now = Date.now()): string {
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token_hash, admin_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    hashToken(token),
    adminId,
    new Date(now).toISOString(),
    new Date(now + SESSION_TTL_MS).toISOString(),
  );
  return token;
}

/** The admin behind a live session; slides the expiry forward once a day of it has been used. */
export function findSessionAdmin(db: DB, token: string, now = Date.now()): SessionAdmin | undefined {
  const row = db
    .prepare(
      `SELECT a.id, a.username, s.expires_at FROM sessions s JOIN admins a ON a.id = s.admin_id
        WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(hashToken(token), new Date(now).toISOString()) as (SessionAdmin & { expires_at: string }) | undefined;
  if (!row) return undefined;
  if (Date.parse(row.expires_at) - now < SESSION_TTL_MS - 24 * 3_600_000) {
    db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(
      new Date(now + SESSION_TTL_MS).toISOString(),
      hashToken(token),
    );
  }
  return { id: row.id, username: row.username };
}

export function deleteSession(db: DB, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

/** Signs the admin out everywhere except the session in `keepToken`. */
export function deleteOtherSessions(db: DB, adminId: number, keepToken: string): void {
  db.prepare('DELETE FROM sessions WHERE admin_id = ? AND token_hash <> ?').run(adminId, hashToken(keepToken));
}

export function purgeExpiredSessions(db: DB): number {
  return db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso()).changes;
}

/** Locks a key (IP + username) for `lockMs` after `maxFailures` wrong passwords within that time. */
export class LoginGuard {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly maxFailures: number,
    private readonly lockMs: number,
  ) {}

  /** Milliseconds until the key may try again; 0 when it is not locked. */
  lockedFor(key: string, now = Date.now()): number {
    const recent = (this.failures.get(key) ?? []).filter((t) => now - t < this.lockMs);
    this.failures.set(key, recent);
    if (recent.length < this.maxFailures) return 0;
    return this.lockMs - (now - recent[recent.length - this.maxFailures]!);
  }

  fail(key: string, now = Date.now()): void {
    const list = this.failures.get(key) ?? [];
    list.push(now);
    this.failures.set(key, list);
  }

  reset(key: string): void {
    this.failures.delete(key);
  }
}
