/**
 * Creates the admin account or resets its password.
 *
 *   development:  npm run admin:password -- [username] [--out <file>]
 *   production:   docker exec aistudio365-shop node server/dist/cli/admin-password.js [username] [--out <file>]
 *
 * The password comes from ADMIN_PASSWORD, or a random one is generated. With --out the generated
 * password is written to that file (mode 600) instead of being printed. Signing in again is needed
 * everywhere after a reset, because the reset also ends the admin's sessions.
 */
import fs from 'node:fs';
import { loadConfig } from '../config.js';
import { openDb } from '../db/index.js';
import { hashPassword, randomPassword } from '../passwords.js';
import { nowIso } from '../time.js';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex >= 0 ? args[outIndex + 1] : undefined;
const outValueIndex = outIndex >= 0 ? outIndex + 1 : -1;
const username = args.find((arg, i) => !arg.startsWith('--') && i !== outValueIndex) ?? 'admin';
if (outIndex >= 0 && !outFile) {
  console.error('--out needs a file name');
  process.exit(1);
}

const password = process.env.ADMIN_PASSWORD ?? randomPassword();
const db = openDb(loadConfig().dbFile);
const hash = await hashPassword(password);
db.transaction(() => {
  db.prepare(
    `INSERT INTO admins (username, password_hash, created_at) VALUES (?, ?, ?)
     ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash`,
  ).run(username, hash, nowIso());
  db.prepare('DELETE FROM sessions WHERE admin_id = (SELECT id FROM admins WHERE username = ?)').run(username);
})();
db.close();

if (process.env.ADMIN_PASSWORD) {
  console.log(`password set for admin "${username}"`);
} else if (outFile) {
  fs.writeFileSync(outFile, `username=${username}\npassword=${password}\n`, { mode: 0o600 });
  console.log(`password for admin "${username}" written to ${outFile}`);
} else {
  console.log(`admin "${username}" password: ${password}`);
}
