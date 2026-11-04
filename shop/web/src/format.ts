import type { OrderStatus, PayMethod } from './api';

/** ¥125 or ¥12.50: whole yuan without decimals, for prices. */
export const yuanShort = (cents: number): string => {
  const value = cents / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
};

/** Always two decimals, for amounts the buyer has to pay exactly. */
export const yuanExact = (cents: number): string => (cents / 100).toFixed(2);

const timeFormat = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export const formatTime = (iso: string | null): string => (iso ? timeFormat.format(new Date(iso)).replace(/\//g, '-') : '');

export const STATUS_TEXT: Record<OrderStatus, string> = {
  pending: '待付款',
  paid: '已付款',
  completed: '已完成',
  cancelled: '已取消',
};

export const PAY_TEXT: Record<PayMethod, string> = { wechat: '微信', alipay: '支付宝' };

/** Mainland China mobile number as 11 digits; same rule as the server. */
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('86')) digits = digits.slice(2);
  return /^1[3-9]\d{9}$/.test(digits) ? digits : null;
}

const PHONE_KEY = 'aistudio365.phone';

export function rememberedPhone(): string {
  try {
    return localStorage.getItem(PHONE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function rememberPhone(phone: string): void {
  try {
    localStorage.setItem(PHONE_KEY, phone);
  } catch {
    // private mode: the buyer types it again next time
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the textarea fallback
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

export const errorMessage = (error: unknown): string =>
  error instanceof Error && error.message ? error.message : '出错了，请稍后再试';

export function setTitle(...parts: (string | undefined)[]): void {
  document.title = parts.filter(Boolean).join(' - ');
}
