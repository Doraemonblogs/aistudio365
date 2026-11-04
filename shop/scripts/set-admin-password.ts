/**
 * Creates the admin account or resets its password.
 *
 *   npm run admin:password -- [username] [--out <file>]
 *
 * The password comes from ADMIN_PASSWORD, or a random one is generated. With --out the generated
 * password is written to that file (mode 600) instead of being printed.
 */
import fs from 'node:fs';
import { loadConfig } from '../server/src/config.js';
import { openDb } from '../server/src/db/index.js';
import { hashPassword, randomPassword } from '../server/src/passwords.js';
import { nowIso } from '../server/src/time.js';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex >= 0 ? args[outIndex + 1] : undefined;
const outValueIndex = outIndex >= 0 ? outIndex + 1 : -1;
const username = args.find((arg, i) => !arg.startsWith('--') && i !== outValueIndex) ?? 'admin';

const password = process.env.ADMIN_PASSWORD ?? randomPassword();
const db = openDb(loadConfig().dbFile);
const hash = await hashPassword(password);
db.prepare(
  `INSERT INTO admins (username, password_hash, created_at) VALUES (?, ?, ?)
   ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash`,
).run(username, hash, nowIso());
db.close();

if (process.env.ADMIN_PASSWORD) {
  console.log(`password set for admin "${username}"`);
} else if (outFile) {
  fs.writeFileSync(outFile, `username=${username}\npassword=${password}\n`, { mode: 0o600 });
  console.log(`password for admin "${username}" written to ${outFile}`);
} else {
  console.log(`admin "${username}" password: ${password}`);
}
