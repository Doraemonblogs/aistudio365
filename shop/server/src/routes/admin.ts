import type { FastifyInstance } from 'fastify';
import {
  createSession,
  deleteOtherSessions,
  deleteSession,
  findSessionAdmin,
  LoginGuard,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  type AdminRow,
  type SessionAdmin,
} from '../auth.js';
import type { DB } from '../db/index.js';
import { AppError } from '../errors.js';
import { hashPassword, verifyPassword } from '../passwords.js';
import { RateLimiter } from '../rateLimit.js';
import { getSettings, updateSettings, type ShopSettings } from '../settings.js';
import {
  cancelOrder,
  completeOrder,
  confirmPayment,
  expireOrders,
  parseCards,
  setOrderNote,
  type OrderRow,
} from '../shop/orders.js';
import { availableStock, getProduct, type ProductRow } from '../shop/products.js';
import { beijingDate, beijingDateStart, dailySales, productSales, salesSummary } from '../shop/stats.js';
import { nowIso } from '../time.js';
import { isUploadPath, MAX_UPLOAD_BYTES, saveImage } from '../uploads.js';

declare module 'fastify' {
  interface FastifyRequest {
    admin?: SessionAdmin;
  }
}

export interface AdminRouteOptions {
  uploadsDir: string;
  cookieSecure: boolean;
}

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer', minimum: 1 } },
} as const;

const text = (max: number) => ({ type: 'string', maxLength: max }) as const;
const yuanCents = { type: 'integer', minimum: 0, maximum: 100_000_000 } as const;

const productBody = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'price'],
  properties: {
    category_id: { type: ['integer', 'null'], minimum: 1 },
    name: { type: 'string', minLength: 1, maxLength: 200 },
    summary: text(500),
    description: text(50_000),
    instructions: text(20_000),
    price: yuanCents,
    original_price: { anyOf: [yuanCents, { type: 'null' }] },
    image: text(500),
    qr_wechat: text(500),
    qr_alipay: text(500),
    stock: { type: 'integer', minimum: -1, maximum: 1_000_000 },
    max_qty: { type: 'integer', minimum: 1, maximum: 1000 },
    card_mode: { type: 'string', enum: ['fixed', 'pool'] },
    card_text: text(5000),
    status: { type: 'string', enum: ['on', 'off'] },
    sort: { type: 'integer', minimum: -100_000, maximum: 100_000 },
  },
} as const;

type ProductInput = {
  category_id?: number | null;
  name: string;
  summary?: string;
  description?: string;
  instructions?: string;
  price: number;
  original_price?: number | null;
  image?: string;
  qr_wechat?: string;
  qr_alipay?: string;
  stock?: number;
  max_qty?: number;
  card_mode?: 'fixed' | 'pool';
  card_text?: string;
  status?: 'on' | 'off';
  sort?: number;
};

const settingsBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    shop_name: { type: 'string', minLength: 1, maxLength: 60 },
    logo: text(500),
    notice: text(20_000),
    contact_wechat: text(60),
    contact_qq: text(30),
    qr_wechat: text(500),
    qr_alipay: text(500),
    order_timeout_minutes: { type: 'integer', minimum: 5, maximum: 1440 },
  },
} as const;

function adminOrder(order: OrderRow) {
  return { ...order, cards: parseCards(order.cards) };
}

export function registerAdminRoutes(app: FastifyInstance, db: DB, options: AdminRouteOptions): void {
  const loginGuard = new LoginGuard(5, 15 * 60_000);
  const loginLimiter = new RateLimiter(30, 15 * 60_000);
  // Compared against when the username doesn't exist, so a miss takes as long as a wrong password.
  const dummyHash = hashPassword('not-a-real-password');
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: options.cookieSecure,
    maxAge: SESSION_TTL_MS / 1000,
  };

  app.post<{ Body: { username: string; password: string } }>(
    '/api/admin/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['username', 'password'],
          additionalProperties: false,
          properties: { username: text(60), password: text(200) },
        },
      },
    },
    async (request, reply) => {
      if (!loginLimiter.allow(request.ip)) throw new AppError(429, '登录尝试太频繁，请稍后再试');
      const username = request.body.username.trim();
      const key = `${request.ip}|${username.toLowerCase()}`;
      const lockedMs = loginGuard.lockedFor(key);
      if (lockedMs > 0) throw new AppError(429, `密码错误次数太多，请 ${Math.ceil(lockedMs / 60_000)} 分钟后再试`);

      const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username) as AdminRow | undefined;
      const ok = await verifyPassword(request.body.password, admin?.password_hash ?? (await dummyHash));
      if (!admin || !ok) {
        loginGuard.fail(key);
        throw new AppError(401, '用户名或密码错误');
      }
      loginGuard.reset(key);
      db.prepare('UPDATE admins SET last_login_at = ? WHERE id = ?').run(nowIso(), admin.id);
      reply.setCookie(SESSION_COOKIE, createSession(db, admin.id), cookieOptions);
      return { username: admin.username };
    },
  );

  app.post('/api/admin/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) deleteSession(db, token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  // Everything below needs a signed-in admin.
  app.register(async (scope) => {
    scope.addHook('preHandler', async (request) => {
      const token = request.cookies[SESSION_COOKIE];
      const admin = token ? findSessionAdmin(db, token) : undefined;
      if (!admin) throw new AppError(401, '请先登录');
      request.admin = admin;
    });

    scope.get('/api/admin/me', async (request) => ({ username: request.admin!.username }));

    scope.put<{ Body: { current: string; next: string } }>(
      '/api/admin/password',
      {
        schema: {
          body: {
            type: 'object',
            required: ['current', 'next'],
            additionalProperties: false,
            properties: { current: text(200), next: { type: 'string', minLength: 8, maxLength: 200 } },
          },
        },
      },
      async (request) => {
        const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(request.admin!.id) as AdminRow;
        if (!(await verifyPassword(request.body.current, admin.password_hash))) throw new AppError(400, '当前密码不正确');
        db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(await hashPassword(request.body.next), admin.id);
        deleteOtherSessions(db, admin.id, request.cookies[SESSION_COOKIE]!);
        return { ok: true };
      },
    );

    // ---- categories ----
    const categoryBody = {
      type: 'object',
      required: ['name'],
      additionalProperties: false,
      properties: { name: { type: 'string', minLength: 1, maxLength: 30 }, sort: { type: 'integer', minimum: -100_000, maximum: 100_000 } },
    } as const;

    scope.get('/api/admin/categories', async () =>
      db
        .prepare(
          `SELECT c.id, c.name, c.sort, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS products
             FROM categories c ORDER BY c.sort DESC, c.id`,
        )
        .all(),
    );

    scope.post<{ Body: { name: string; sort?: number } }>('/api/admin/categories', { schema: { body: categoryBody } }, async (request, reply) => {
      const result = db
        .prepare('INSERT INTO categories (name, sort, created_at) VALUES (?, ?, ?)')
        .run(request.body.name.trim(), request.body.sort ?? 0, nowIso());
      return reply.status(201).send({ id: Number(result.lastInsertRowid) });
    });

    scope.put<{ Params: { id: number }; Body: { name: string; sort?: number } }>(
      '/api/admin/categories/:id',
      { schema: { params: idParams, body: categoryBody } },
      async (request) => {
        const changed = db
          .prepare('UPDATE categories SET name = ?, sort = COALESCE(?, sort) WHERE id = ?')
          .run(request.body.name.trim(), request.body.sort ?? null, request.params.id).changes;
        if (!changed) throw new AppError(404, '分类不存在');
        return { ok: true };
      },
    );

    scope.delete<{ Params: { id: number } }>('/api/admin/categories/:id', { schema: { params: idParams } }, async (request) => {
      if (!db.prepare('DELETE FROM categories WHERE id = ?').run(request.params.id).changes) throw new AppError(404, '分类不存在');
      return { ok: true };
    });

    // ---- products ----
    function productAdminView(p: ProductRow & { category_name?: string | null }) {
      const counts = db
        .prepare(
          `SELECT (SELECT COUNT(*) FROM cards WHERE product_id = @id AND status = 'available') AS cards_available,
                  (SELECT COUNT(*) FROM cards WHERE product_id = @id AND status = 'sold') AS cards_sold,
                  (SELECT COALESCE(SUM(quantity), 0) FROM orders WHERE product_id = @id AND status IN ('paid', 'completed')) AS sold,
                  (SELECT COALESCE(SUM(quantity), 0) FROM orders WHERE product_id = @id AND status = 'pending') AS pending`,
        )
        .get({ id: p.id }) as { cards_available: number; cards_sold: number; sold: number; pending: number };
      return { ...p, ...counts, available: availableStock(db, p) };
    }

    function checkProduct(input: ProductInput): void {
      for (const field of ['image', 'qr_wechat', 'qr_alipay'] as const) {
        if (input[field] !== undefined && !isUploadPath(input[field])) throw new AppError(400, '图片地址不正确，请重新上传');
      }
      if (input.category_id != null && !db.prepare('SELECT 1 FROM categories WHERE id = ?').get(input.category_id)) {
        throw new AppError(400, '分类不存在');
      }
    }

    const productColumns = {
      category_id: null,
      summary: '',
      description: '',
      instructions: '',
      original_price: null,
      image: '',
      qr_wechat: '',
      qr_alipay: '',
      stock: -1,
      max_qty: 10,
      card_mode: 'fixed',
      card_text: '',
      status: 'on',
      sort: 0,
    };

    scope.get('/api/admin/products', async () => {
      const rows = db
        .prepare(
          `SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id
            ORDER BY COALESCE(c.sort, 0) DESC, p.sort DESC, p.id`,
        )
        .all() as (ProductRow & { category_name: string | null })[];
      return rows.map(productAdminView);
    });

    scope.get<{ Params: { id: number } }>('/api/admin/products/:id', { schema: { params: idParams } }, async (request) => {
      const product = getProduct(db, request.params.id);
      if (!product) throw new AppError(404, '商品不存在');
      return productAdminView(product);
    });

    scope.post<{ Body: ProductInput }>('/api/admin/products', { schema: { body: productBody } }, async (request, reply) => {
      checkProduct(request.body);
      const now = nowIso();
      const result = db
        .prepare(
          `INSERT INTO products (category_id, name, summary, description, instructions, price, original_price, image, qr_wechat,
                                 qr_alipay, stock, max_qty, card_mode, card_text, status, sort, created_at, updated_at)
           VALUES (@category_id, @name, @summary, @description, @instructions, @price, @original_price, @image, @qr_wechat,
                   @qr_alipay, @stock, @max_qty, @card_mode, @card_text, @status, @sort, @now, @now)`,
        )
        .run({ ...productColumns, ...request.body, name: request.body.name.trim(), now });
      return reply.status(201).send(productAdminView(getProduct(db, Number(result.lastInsertRowid))!));
    });

    scope.put<{ Params: { id: number }; Body: ProductInput }>(
      '/api/admin/products/:id',
      { schema: { params: idParams, body: productBody } },
      async (request) => {
        const current = getProduct(db, request.params.id);
        if (!current) throw new AppError(404, '商品不存在');
        checkProduct(request.body);
        const { id: _id, created_at: _created, updated_at: _updated, ...currentValues } = current;
        db.prepare(
          `UPDATE products SET category_id = @category_id, name = @name, summary = @summary, description = @description,
                  instructions = @instructions, price = @price, original_price = @original_price, image = @image,
                  qr_wechat = @qr_wechat, qr_alipay = @qr_alipay, stock = @stock, max_qty = @max_qty,
                  card_mode = @card_mode, card_text = @card_text, status = @status, sort = @sort, updated_at = @now
            WHERE id = @id`,
        ).run({ ...currentValues, ...request.body, name: request.body.name.trim(), id: current.id, now: nowIso() });
        return productAdminView(getProduct(db, current.id)!);
      },
    );

    scope.patch<{ Params: { id: number }; Body: { status: 'on' | 'off' } }>(
      '/api/admin/products/:id/status',
      {
        schema: {
          params: idParams,
          body: { type: 'object', required: ['status'], additionalProperties: false, properties: { status: { type: 'string', enum: ['on', 'off'] } } },
        },
      },
      async (request) => {
        const changed = db
          .prepare('UPDATE products SET status = ?, updated_at = ? WHERE id = ?')
          .run(request.body.status, nowIso(), request.params.id).changes;
        if (!changed) throw new AppError(404, '商品不存在');
        return { ok: true };
      },
    );

    scope.delete<{ Params: { id: number } }>('/api/admin/products/:id', { schema: { params: idParams } }, async (request) => {
      if (!getProduct(db, request.params.id)) throw new AppError(404, '商品不存在');
      if (db.prepare('SELECT 1 FROM orders WHERE product_id = ? LIMIT 1').get(request.params.id)) {
        throw new AppError(409, '这个商品已经有订单，不能删除；不想卖了可以下架');
      }
      db.prepare('DELETE FROM products WHERE id = ?').run(request.params.id);
      return { ok: true };
    });

    // ---- card pool ----
    scope.get<{ Params: { id: number }; Querystring: { status?: 'available' | 'sold' } }>(
      '/api/admin/products/:id/cards',
      {
        schema: {
          params: idParams,
          querystring: { type: 'object', properties: { status: { type: 'string', enum: ['available', 'sold'] } } },
        },
      },
      async (request) =>
        db
          .prepare(
            `SELECT c.id, c.content, c.status, c.created_at, c.sold_at, o.order_no
               FROM cards c LEFT JOIN orders o ON o.id = c.order_id
              WHERE c.product_id = @id ${request.query.status ? 'AND c.status = @status' : ''}
              ORDER BY c.status, c.id DESC LIMIT 2000`,
          )
          .all({ id: request.params.id, status: request.query.status ?? null }),
    );

    scope.post<{ Params: { id: number }; Body: { text: string } }>(
      '/api/admin/products/:id/cards',
      {
        schema: {
          params: idParams,
          body: { type: 'object', required: ['text'], additionalProperties: false, properties: { text: text(500_000) } },
        },
      },
      async (request) => {
        if (!getProduct(db, request.params.id)) throw new AppError(404, '商品不存在');
        const lines = request.body.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        if (lines.length > 5000) throw new AppError(400, '一次最多导入 5000 张卡密');
        const existing = new Set(
          (db.prepare("SELECT content FROM cards WHERE product_id = ? AND status = 'available'").all(request.params.id) as {
            content: string;
          }[]).map((row) => row.content),
        );
        const insert = db.prepare('INSERT INTO cards (product_id, content, created_at) VALUES (?, ?, ?)');
        let added = 0;
        const now = nowIso();
        db.transaction(() => {
          for (const line of lines) {
            if (existing.has(line)) continue;
            existing.add(line);
            insert.run(request.params.id, line, now);
            added++;
          }
        })();
        return { added, skipped: lines.length - added };
      },
    );

    scope.delete<{ Params: { id: number } }>('/api/admin/cards/:id', { schema: { params: idParams } }, async (request) => {
      const card = db.prepare('SELECT status FROM cards WHERE id = ?').get(request.params.id) as { status: string } | undefined;
      if (!card) throw new AppError(404, '卡密不存在');
      if (card.status !== 'available') throw new AppError(409, '已售出的卡密不能删除');
      db.prepare('DELETE FROM cards WHERE id = ?').run(request.params.id);
      return { ok: true };
    });

    // ---- orders ----
    scope.get<{
      Querystring: { status?: string; q?: string; from?: string; to?: string; limit?: number; offset?: number };
    }>(
      '/api/admin/orders',
      {
        schema: {
          querystring: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['pending', 'paid', 'completed', 'cancelled'] },
              q: text(40),
              from: text(10),
              to: text(10),
              limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
              offset: { type: 'integer', minimum: 0, default: 0 },
            },
          },
        },
      },
      async (request) => {
        expireOrders(db);
        const { status, q, from, to, limit = 20, offset = 0 } = request.query;
        const where: string[] = [];
        const params: Record<string, unknown> = { limit, offset };
        if (q?.trim()) {
          where.push('(phone LIKE @q OR order_no LIKE @q)');
          params.q = `%${q.trim().toUpperCase()}%`;
        }
        if (from) {
          where.push('created_at >= @from');
          params.from = beijingDateStart(from);
        }
        if (to) {
          where.push('created_at < @to');
          params.to = new Date(Date.parse(beijingDateStart(to)) + 24 * 3_600_000).toISOString();
        }
        const filtered = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const countRows = db
          .prepare(`SELECT status, COUNT(*) AS n FROM orders ${filtered} GROUP BY status`)
          .all(params) as { status: string; n: number }[];
        const counts = { pending: 0, paid: 0, completed: 0, cancelled: 0 } as Record<string, number>;
        for (const row of countRows) counts[row.status] = row.n;
        const withStatus = status ? `${filtered ? `${filtered} AND` : 'WHERE'} status = @status` : filtered;
        if (status) params.status = status;
        const total = (db.prepare(`SELECT COUNT(*) AS n FROM orders ${withStatus}`).get(params) as { n: number }).n;
        const items = db
          .prepare(`SELECT * FROM orders ${withStatus} ORDER BY created_at DESC, id DESC LIMIT @limit OFFSET @offset`)
          .all(params) as OrderRow[];
        return { items: items.map(adminOrder), total, counts };
      },
    );

    scope.post<{ Params: { id: number } }>('/api/admin/orders/:id/confirm', { schema: { params: idParams } }, async (request) =>
      adminOrder(confirmPayment(db, request.params.id)),
    );
    scope.post<{ Params: { id: number } }>('/api/admin/orders/:id/complete', { schema: { params: idParams } }, async (request) =>
      adminOrder(completeOrder(db, request.params.id)),
    );
    scope.post<{ Params: { id: number } }>('/api/admin/orders/:id/cancel', { schema: { params: idParams } }, async (request) =>
      adminOrder(cancelOrder(db, request.params.id)),
    );
    scope.put<{ Params: { id: number }; Body: { note: string } }>(
      '/api/admin/orders/:id/note',
      {
        schema: {
          params: idParams,
          body: { type: 'object', required: ['note'], additionalProperties: false, properties: { note: text(500) } },
        },
      },
      async (request) => adminOrder(setOrderNote(db, request.params.id, request.body.note.trim())),
    );

    // ---- stats ----
    scope.get('/api/admin/stats/summary', async () => {
      expireOrders(db);
      return salesSummary(db);
    });

    scope.get<{ Querystring: { days?: number } }>(
      '/api/admin/stats/daily',
      { schema: { querystring: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 366, default: 30 } } } } },
      async (request) => dailySales(db, request.query.days ?? 30),
    );

    scope.get<{ Querystring: { from?: string; to?: string } }>(
      '/api/admin/stats/products',
      { schema: { querystring: { type: 'object', properties: { from: text(10), to: text(10) } } } },
      async (request) => {
        const today = beijingDate(new Date());
        return productSales(db, request.query.from ?? `${today.slice(0, 8)}01`, request.query.to ?? today);
      },
    );

    // ---- settings & uploads ----
    scope.get('/api/admin/settings', async () => getSettings(db));

    scope.put<{ Body: Partial<ShopSettings> }>('/api/admin/settings', { schema: { body: settingsBody } }, async (request) => {
      for (const field of ['logo', 'qr_wechat', 'qr_alipay'] as const) {
        const value = request.body[field];
        if (value !== undefined && !isUploadPath(value)) throw new AppError(400, '图片地址不正确，请重新上传');
      }
      return updateSettings(db, request.body);
    });

    scope.post('/api/admin/uploads', async (request) => {
      const file = await request.file({ limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
      if (!file) throw new AppError(400, '没有收到图片');
      let buffer: Buffer;
      try {
        buffer = await file.toBuffer();
      } catch {
        throw new AppError(413, '图片太大了，单张不能超过 5 MB');
      }
      return { url: await saveImage(options.uploadsDir, buffer) };
    });
  });
}
