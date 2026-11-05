export interface Category {
  id: number;
  name: string;
}

export interface Shop {
  shop_name: string;
  logo: string;
  notice: string;
  contact_wechat: string;
  contact_qq: string;
  categories: Category[];
}

export type StockStatus = 'in_stock' | 'low' | 'out';

export interface ProductSummary {
  id: number;
  category_id: number | null;
  name: string;
  summary: string;
  price: number;
  original_price: number | null;
  image: string;
  stock_status: StockStatus;
}

export interface ProductDetail extends ProductSummary {
  description: string;
  max_qty: number;
}

export type OrderStatus = 'pending' | 'paid' | 'completed' | 'cancelled';
export type PayMethod = 'wechat' | 'alipay';

export interface BuyerOrder {
  order_no: string;
  status: OrderStatus;
  product_id: number | null;
  product_name: string;
  product_image: string;
  quantity: number;
  unit_price: number;
  amount: number;
  discount: number;
  coupon_code: string;
  pay_method: PayMethod;
  created_at: string;
  expire_at: string;
  paid_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  qr: { url: string; fixed_amount: boolean } | null;
  cards: string[];
  instructions: string;
}

export type CouponKind = 'amount' | 'rate';

/** A coupon's terms. kind 'amount': value cents off; 'rate': pay value percent (85 = 8.5 折). */
export interface CouponTerms {
  name: string;
  kind: CouponKind;
  value: number;
  min_amount: number;
  product_ids: number[];
  starts_at: string | null;
  ends_at: string | null;
}

export interface BuyerCoupon extends CouponTerms {
  code: string;
}

export interface CouponQuote extends BuyerCoupon {
  subtotal: number;
  discount: number;
  amount: number;
}

export interface OrderListItem {
  order_no: string;
  product_name: string;
  quantity: number;
  amount: number;
  status: OrderStatus;
  created_at: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: init.body ? { 'Content-Type': 'application/json', ...init.headers } : init.headers,
    });
  } catch {
    throw new ApiError(0, '网络连接失败，请检查网络后重试');
  }
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (body as { error?: string }).error ?? '出错了，请稍后再试';
    throw new ApiError(response.status, message);
  }
  return body as T;
}

const q = encodeURIComponent;

export const api = {
  shop: () => request<Shop>('/api/shop'),
  products: () => request<ProductSummary[]>('/api/products'),
  product: (id: number) => request<ProductDetail>(`/api/products/${id}`),
  createOrder: (input: { product_id: number; quantity: number; phone: string; pay_method: PayMethod; coupon_code?: string }) =>
    request<BuyerOrder>('/api/orders', { method: 'POST', body: JSON.stringify(input) }),
  checkCoupon: (input: { code: string; product_id: number; quantity: number }) =>
    request<CouponQuote>('/api/coupons/check', { method: 'POST', body: JSON.stringify(input) }),
  order: (orderNo: string, phone: string) => request<BuyerOrder>(`/api/orders/${q(orderNo)}?phone=${q(phone)}`),
  orders: (phone: string) => request<OrderListItem[]>(`/api/orders?phone=${q(phone)}`),
  markPaid: (orderNo: string, phone: string) =>
    request<BuyerOrder>(`/api/orders/${q(orderNo)}/paid`, { method: 'POST', body: JSON.stringify({ phone }) }),
};
