import { ApiError, type OrderStatus, type PayMethod } from '../api';

export interface AdminCategory {
  id: number;
  name: string;
  sort: number;
  products: number;
}

export interface ProductInput {
  category_id: number | null;
  name: string;
  summary: string;
  description: string;
  instructions: string;
  price: number;
  original_price: number | null;
  image: string;
  qr_wechat: string;
  qr_alipay: string;
  stock: number;
  max_qty: number;
  card_mode: 'fixed' | 'pool';
  card_text: string;
  status: 'on' | 'off';
  sort: number;
}

export interface AdminProduct extends ProductInput {
  id: number;
  category_name?: string | null;
  created_at: string;
  updated_at: string;
  cards_available: number;
  cards_sold: number;
  sold: number;
  pending: number;
  available: number | null;
}

export interface AdminCard {
  id: number;
  content: string;
  status: 'available' | 'sold';
  created_at: string;
  sold_at: string | null;
  order_no: string | null;
}

export interface AdminOrder {
  id: number;
  order_no: string;
  phone: string;
  product_id: number | null;
  product_name: string;
  unit_price: number;
  quantity: number;
  amount: number;
  pay_method: PayMethod;
  status: OrderStatus;
  cards: string[];
  admin_note: string;
  client_ip: string;
  created_at: string;
  expire_at: string;
  paid_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
}

export interface OrderPage {
  items: AdminOrder[];
  total: number;
  counts: Record<OrderStatus, number>;
}

export interface SalesFigure {
  amount: number;
  orders: number;
}

export interface SalesSummary {
  today: SalesFigure;
  week: SalesFigure;
  month: SalesFigure;
  total: SalesFigure;
  pending_orders: number;
  paid_orders: number;
}

export interface DailySales extends SalesFigure {
  date: string;
}

export interface ProductSales {
  product_id: number | null;
  product_name: string;
  orders: number;
  quantity: number;
  amount: number;
}

export interface ShopSettings {
  shop_name: string;
  logo: string;
  notice: string;
  contact_wechat: string;
  contact_qq: string;
  qr_wechat: string;
  qr_alipay: string;
  order_timeout_minutes: number;
}

let onUnauthorized: () => void = () => {};

/** Called when a request comes back 401 (session expired); the router sends the admin to login. */
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isJson = typeof init.body === 'string';
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      ...init,
      headers: isJson ? { 'Content-Type': 'application/json', ...init.headers } : init.headers,
    });
  } catch {
    throw new ApiError(0, '网络连接失败，请检查网络后重试');
  }
  const body: unknown = await response.json().catch(() => ({}));
  // Login and the session probe handle their own 401s (the route guard redirects for the probe).
  if (response.status === 401 && path !== '/api/admin/login' && path !== '/api/admin/me') onUnauthorized();
  if (!response.ok) throw new ApiError(response.status, (body as { error?: string }).error ?? '出错了，请稍后再试');
  return body as T;
}

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

const query = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : '';
};

export const adminApi = {
  login: (username: string, password: string) =>
    request<{ username: string }>('/api/admin/login', send('POST', { username, password })),
  logout: () => request<{ ok: true }>('/api/admin/logout', send('POST')),
  me: () => request<{ username: string }>('/api/admin/me'),
  changePassword: (current: string, next: string) => request<{ ok: true }>('/api/admin/password', send('PUT', { current, next })),

  categories: () => request<AdminCategory[]>('/api/admin/categories'),
  createCategory: (name: string, sort: number) => request<{ id: number }>('/api/admin/categories', send('POST', { name, sort })),
  updateCategory: (id: number, name: string, sort: number) =>
    request<{ ok: true }>(`/api/admin/categories/${id}`, send('PUT', { name, sort })),
  deleteCategory: (id: number) => request<{ ok: true }>(`/api/admin/categories/${id}`, send('DELETE')),

  products: () => request<AdminProduct[]>('/api/admin/products'),
  product: (id: number) => request<AdminProduct>(`/api/admin/products/${id}`),
  createProduct: (input: ProductInput) => request<AdminProduct>('/api/admin/products', send('POST', input)),
  updateProduct: (id: number, input: ProductInput) => request<AdminProduct>(`/api/admin/products/${id}`, send('PUT', input)),
  setProductStatus: (id: number, status: 'on' | 'off') =>
    request<{ ok: true }>(`/api/admin/products/${id}/status`, send('PATCH', { status })),
  deleteProduct: (id: number) => request<{ ok: true }>(`/api/admin/products/${id}`, send('DELETE')),

  cards: (productId: number, status?: 'available' | 'sold') =>
    request<AdminCard[]>(`/api/admin/products/${productId}/cards${query({ status })}`),
  importCards: (productId: number, text: string) =>
    request<{ added: number; skipped: number }>(`/api/admin/products/${productId}/cards`, send('POST', { text })),
  deleteCard: (id: number) => request<{ ok: true }>(`/api/admin/cards/${id}`, send('DELETE')),

  orders: (params: { status?: OrderStatus; q?: string; from?: string; to?: string; limit?: number; offset?: number }) =>
    request<OrderPage>(`/api/admin/orders${query(params)}`),
  confirmOrder: (id: number) => request<AdminOrder>(`/api/admin/orders/${id}/confirm`, send('POST')),
  completeOrder: (id: number) => request<AdminOrder>(`/api/admin/orders/${id}/complete`, send('POST')),
  cancelOrder: (id: number) => request<AdminOrder>(`/api/admin/orders/${id}/cancel`, send('POST')),
  noteOrder: (id: number, note: string) => request<AdminOrder>(`/api/admin/orders/${id}/note`, send('PUT', { note })),

  summary: () => request<SalesSummary>('/api/admin/stats/summary'),
  daily: (days: number) => request<DailySales[]>(`/api/admin/stats/daily${query({ days })}`),
  productSales: (from: string, to: string) => request<ProductSales[]>(`/api/admin/stats/products${query({ from, to })}`),

  settings: () => request<ShopSettings>('/api/admin/settings'),
  saveSettings: (settings: Partial<ShopSettings>) => request<ShopSettings>('/api/admin/settings', send('PUT', settings)),

  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ url: string }>('/api/admin/uploads', { method: 'POST', body: form });
  },
};
