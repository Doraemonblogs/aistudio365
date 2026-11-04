import fs from 'node:fs';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb } from './db/index.js';

const config = loadConfig();
fs.mkdirSync(config.uploadsDir, { recursive: true });
const db = openDb(config.dbFile);
const app = buildApp(db);

const shutdown = async () => {
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: config.port, host: config.host });
