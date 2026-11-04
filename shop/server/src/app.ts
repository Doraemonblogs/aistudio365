import Fastify, { type FastifyInstance } from 'fastify';
import type { DB } from './db/index.js';

/** Builds the HTTP app. Phase 1 only exposes a health check; the shop and admin APIs come next. */
export function buildApp(db: DB): FastifyInstance {
  const app = Fastify({ logger: true, trustProxy: true });

  app.get('/api/health', async () => {
    const row = db.prepare('SELECT COUNT(*) AS products FROM products').get() as { products: number };
    return { ok: true, products: row.products };
  });

  return app;
}
