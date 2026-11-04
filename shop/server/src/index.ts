import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb } from './db/index.js';
import { expireOrders } from './shop/orders.js';

const config = loadConfig();
const db = openDb(config.dbFile);
const app = buildApp(db, { uploadsDir: config.uploadsDir, webDir: config.webDir });

// Cancel unpaid orders past their deadline once a minute (reads also do it on demand).
const expiry = setInterval(() => {
  try {
    const cancelled = expireOrders(db);
    if (cancelled > 0) app.log.info({ cancelled }, 'expired unpaid orders');
  } catch (error) {
    app.log.error(error, 'order expiry failed');
  }
}, 60_000);
expiry.unref();

const shutdown = async () => {
  clearInterval(expiry);
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: config.port, host: config.host });
