import type { FastifyInstance } from 'fastify';
import type { DB } from '../db/index.js';
import { AppError } from '../errors.js';
import { normalizePhone } from '../phone.js';
import { RateLimiter } from '../rateLimit.js';
import { getSettings, type ShopSettings } from '../settings.js';
import {
  buyerConfirmPayment,
  createOrder,
  expireOrders,
  findBuyerOrder,
  listBuyerOrders,
  parseCards,
  type OrderRow,
  type PayMethod,
} from '../shop/orders.js';
import { availableStock, getProduct, listOnShelf, stockStatus, type ProductRow } from '../shop/products.js';
import { couponProductIds, couponsForPhone, normalizeCode, quoteCoupon, type CouponRow } from '../shop/coupons.js';

/** The terms of a coupon, as a buyer sees them. */
function buyerCoupon(c: CouponRow) {
  return {
    code: c.code,
    name: c.name,
    kind: c.kind,
    value: c.value,
    min_amount: c.min_amount,
    product_ids: couponProductIds(c),
    starts_at: c.starts_at,
    ends_at: c.ends_at,
  };
}

function productSummary(db: DB, p: ProductRow) {
  return {
    id: p.id,
    category_id: p.category_id,
    name: p.name,
    summary: p.summary,
    price: p.price,
    original_price: p.original_price,
    image: p.image,
    stock_status: stockStatus(availableStock(db, p)),
  };
}

/** What the buyer sees of an order. Cards and instructions only once it is paid. */
function buyerOrder(db: DB, order: OrderRow, settings: ShopSettings) {
  const product = order.product_id === null ? undefined : getProduct(db, order.product_id);
  const delivered = order.status === 'paid' || order.status === 'completed';
  let qr: { url: string; fixed_amount: boolean } | null = null;
  if (order.status === 'pending') {
    // A product's fixed-amount code only fits a single unit bought at the current price, with no coupon.
    const fixed =
      product && order.quantity === 1 && order.unit_price === product.price && order.discount === 0
        ? order.pay_method === 'wechat'
          ? product.qr_wechat
          : product.qr_alipay
        : '';
    const general = order.pay_method === 'wechat' ? settings.qr_wechat : settings.qr_alipay;
    qr = { url: fixed || general, fixed_amount: Boolean(fixed) };
  }
  return {
    order_no: order.order_no,
    status: order.status,
    product_id: order.product_id,
    product_name: order.product_name,
    product_image: product?.image ?? '',
    quantity: order.quantity,
    unit_price: order.unit_price,
    amount: order.amount,
    discount: order.discount,
    coupon_code: order.coupon_code,
    pay_method: order.pay_method,
    created_at: order.created_at,
    expire_at: order.expire_at,
    paid_at: order.paid_at,
    completed_at: order.completed_at,
    cancelled_at: order.cancelled_at,
    qr,
    cards: delivered ? parseCards(order.cards) : [],
    instructions: delivered ? (product?.instructions ?? '') : '',
  };
}

const phoneQuery = {
  type: 'object',
  required: ['phone'],
  properties: { phone: { type: 'string', maxLength: 32 } },
} as const;

function requirePhone(raw: string): string {
  const phone = normalizePhone(raw);
  if (!phone) throw new AppError(400, '请输入正确的 11 位手机号');
  return phone;
}

export function registerPublicRoutes(app: FastifyInstance, db: DB): void {
  const orderLimiter = new RateLimiter(5, 60_000);
  const lookupLimiter = new RateLimiter(30, 60_000);

  app.get('/api/shop', async () => {
    const s = getSettings(db);
    const categories = db.prepare('SELECT id, name FROM categories ORDER BY sort DESC, id').all();
    return {
      shop_name: s.shop_name,
      logo: s.logo,
      notice: s.notice,
      contact_wechat: s.contact_wechat,
      contact_qq: s.contact_qq,
      categories,
    };
  });

  app.get<{ Querystring: { category?: number } }>(
    '/api/products',
    { schema: { querystring: { type: 'object', properties: { category: { type: 'integer', minimum: 1 } } } } },
    async (request) => listOnShelf(db, request.query.category).map((p) => productSummary(db, p)),
  );

  app.get<{ Params: { id: number } }>(
    '/api/products/:id',
    {
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } },
      },
    },
    async (request) => {
      const product = getProduct(db, request.params.id);
      if (!product || product.status !== 'on') throw new AppError(404, '商品不存在或已下架');
      const available = availableStock(db, product);
      return {
        ...productSummary(db, product),
        description: product.description,
        max_qty: available === null ? product.max_qty : Math.max(0, Math.min(product.max_qty, available)),
      };
    },
  );

  // Whether a coupon code fits this purchase, and what it comes to.
  app.post<{ Body: { code: string; product_id: number; quantity: number; phone?: string } }>(
    '/api/coupons/check',
    {
      schema: {
        body: {
          type: 'object',
          required: ['code', 'product_id', 'quantity'],
          additionalProperties: false,
          properties: {
            code: { type: 'string', maxLength: 40 },
            product_id: { type: 'integer', minimum: 1 },
            quantity: { type: 'integer', minimum: 1, maximum: 1000 },
            phone: { type: 'string', maxLength: 32 },
          },
        },
      },
    },
    async (request) => {
      if (!lookupLimiter.allow(request.ip)) throw new AppError(429, '操作太频繁了，请稍后再试');
      const product = getProduct(db, request.body.product_id);
      if (!product || product.status !== 'on') throw new AppError(404, '商品不存在或已下架');
      if (!normalizeCode(request.body.code)) throw new AppError(400, '请输入券码');
      expireOrders(db);
      const quote = quoteCoupon(db, request.body.code, {
        productId: product.id,
        subtotal: product.price * request.body.quantity,
        phone: normalizePhone(request.body.phone ?? ''),
      });
      return { ...buyerCoupon(quote.coupon), subtotal: quote.subtotal, discount: quote.discount, amount: quote.amount };
    },
  );

  // Coupons customer service gave to this phone, so the buyer can pick one instead of typing it.
  app.get<{ Querystring: { phone: string } }>('/api/coupons', { schema: { querystring: phoneQuery } }, async (request) => {
    if (!lookupLimiter.allow(request.ip)) throw new AppError(429, '查询太频繁了，请稍后再试');
    const phone = requirePhone(request.query.phone);
    expireOrders(db);
    return couponsForPhone(db, phone).map(buyerCoupon);
  });

  app.post<{ Body: { product_id: number; quantity: number; phone: string; pay_method: PayMethod; coupon_code?: string } }>(
    '/api/orders',
    {
      schema: {
        body: {
          type: 'object',
          required: ['product_id', 'quantity', 'phone', 'pay_method'],
          additionalProperties: false,
          properties: {
            product_id: { type: 'integer', minimum: 1 },
            quantity: { type: 'integer', minimum: 1, maximum: 1000 },
            phone: { type: 'string', maxLength: 32 },
            pay_method: { type: 'string', enum: ['wechat', 'alipay'] },
            coupon_code: { type: 'string', maxLength: 40 },
          },
        },
      },
    },
    async (request, reply) => {
      const phone = requirePhone(request.body.phone);
      if (!orderLimiter.allow(request.ip)) throw new AppError(429, '下单太频繁了，请稍后再试');
      const settings = getSettings(db);
      // A coupon held by an order that has just run out of time is free again.
      if (request.body.coupon_code) expireOrders(db);
      const order = createOrder(
        db,
        {
          productId: request.body.product_id,
          quantity: request.body.quantity,
          phone,
          payMethod: request.body.pay_method,
          clientIp: request.ip,
          couponCode: request.body.coupon_code,
        },
        settings.order_timeout_minutes,
      );
      return reply.status(201).send(buyerOrder(db, order, settings));
    },
  );

  app.get<{ Params: { orderNo: string }; Querystring: { phone: string } }>(
    '/api/orders/:orderNo',
    {
      schema: {
        params: { type: 'object', required: ['orderNo'], properties: { orderNo: { type: 'string', maxLength: 32 } } },
        querystring: phoneQuery,
      },
    },
    async (request) => {
      if (!lookupLimiter.allow(request.ip)) throw new AppError(429, '查询太频繁了，请稍后再试');
      const phone = requirePhone(request.query.phone);
      expireOrders(db);
      const order = findBuyerOrder(db, request.params.orderNo.trim().toUpperCase(), phone);
      if (!order) throw new AppError(404, '没有找到这个订单，请检查订单号和手机号');
      return buyerOrder(db, order, getSettings(db));
    },
  );

  // "我已付款": the buyer's word is enough; the cards show straight away.
  app.post<{ Params: { orderNo: string }; Body: { phone: string } }>(
    '/api/orders/:orderNo/paid',
    {
      schema: {
        params: { type: 'object', required: ['orderNo'], properties: { orderNo: { type: 'string', maxLength: 32 } } },
        body: phoneQuery,
      },
    },
    async (request) => {
      if (!lookupLimiter.allow(request.ip)) throw new AppError(429, '操作太频繁了，请稍后再试');
      const phone = requirePhone(request.body.phone);
      expireOrders(db);
      const order = findBuyerOrder(db, request.params.orderNo.trim().toUpperCase(), phone);
      if (!order) throw new AppError(404, '没有找到这个订单，请检查订单号和手机号');
      return buyerOrder(db, buyerConfirmPayment(db, order), getSettings(db));
    },
  );

  app.get<{ Querystring: { phone: string } }>(
    '/api/orders',
    { schema: { querystring: phoneQuery } },
    async (request) => {
      if (!lookupLimiter.allow(request.ip)) throw new AppError(429, '查询太频繁了，请稍后再试');
      const phone = requirePhone(request.query.phone);
      expireOrders(db);
      return listBuyerOrders(db, phone).map((o) => ({
        order_no: o.order_no,
        product_name: o.product_name,
        quantity: o.quantity,
        amount: o.amount,
        status: o.status,
        created_at: o.created_at,
      }));
    },
  );
}
