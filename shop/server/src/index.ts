import { buildApp } from './app.js';
import { purgeExpiredSessions } from './auth.js';
import { loadConfig } from './config.js';
import { openDb } from './db/index.js';
import { expireOrders } from './shop/orders.js';

const config = loadConfig();
const db = openDb(config.dbFile);
const app = buildApp(db, { uploadsDir: config.uploadsDir, webDir: config.webDir, cookieSecure: config.cookieSecure });

// Once a minute: cancel unpaid orders past their deadline (reads also do it on demand) and
// drop expired admin sessions.
const housekeeping = setInterval(() => {
  try {
    const cancelled = expireOrders(db);
    if (cancelled > 0) app.log.info({ cancelled }, 'expired unpaid orders');
    purgeExpiredSessions(db);
  } catch (error) {
    app.log.error(error, 'housekeeping failed');
  }
}, 60_000);
housekeeping.unref();

const shutdown = async () => {
  clearInterval(housekeeping);
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: config.port, host: config.host });
