import fs from 'node:fs';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import type { DB } from './db/index.js';
import { AppError } from './errors.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerPublicRoutes } from './routes/public.js';

export interface AppOptions {
  uploadsDir: string;
  /** Built frontend (web/dist); skipped when it doesn't exist, e.g. in API tests. */
  webDir?: string;
  logger?: boolean;
  /** Send the admin session cookie only over HTTPS (default true). */
  cookieSecure?: boolean;
}

export function buildApp(db: DB, options: AppOptions): FastifyInstance {
  // One proxy hop (nginx) sits in front, so the last X-Forwarded-For entry is the client; earlier
  // entries are whatever the client sent and are not trusted.
  const app = Fastify({ logger: options.logger ?? true, trustProxy: (_address: string, hop: number) => hop < 1 });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError) return reply.status(error.statusCode).send({ error: error.message });
    if (error.validation) return reply.status(400).send({ error: '请求参数不正确' });
    if (error.statusCode && error.statusCode < 500) return reply.status(error.statusCode).send({ error: error.message });
    request.log.error(error);
    return reply.status(500).send({ error: '服务器出错了，请稍后再试' });
  });

  app.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  });

  app.get('/api/health', async () => {
    const row = db.prepare('SELECT COUNT(*) AS products FROM products').get() as { products: number };
    return { ok: true, products: row.products };
  });

  app.register(fastifyCookie);
  app.register(fastifyMultipart);
  registerPublicRoutes(app, db);
  registerAdminRoutes(app, db, { uploadsDir: options.uploadsDir, cookieSecure: options.cookieSecure ?? true });

  fs.mkdirSync(options.uploadsDir, { recursive: true });
  app.register(fastifyStatic, {
    root: options.uploadsDir,
    prefix: '/uploads/',
    decorateReply: false,
    maxAge: '1d',
  });

  const webDir = options.webDir;
  if (webDir && fs.existsSync(webDir)) {
    app.register(fastifyStatic, {
      root: webDir,
      prefix: '/',
      cacheControl: false,
      setHeaders(reply, filePath) {
        // Vite fingerprints everything under assets/, so those never change; the rest must revalidate.
        const hashed = /[\\/]assets[\\/]/.test(filePath);
        reply.header('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
    // Single-page app: unknown non-API paths get index.html and the router takes over.
    app.setNotFoundHandler((request, reply) => {
      const path = request.url.split('?')[0] ?? '';
      if (request.method !== 'GET' || path.startsWith('/api/') || path.startsWith('/uploads/')) {
        return reply.status(404).send({ error: '页面不存在' });
      }
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    });
  } else {
    app.setNotFoundHandler((_request, reply) => reply.status(404).send({ error: '页面不存在' }));
  }

  return app;
}
