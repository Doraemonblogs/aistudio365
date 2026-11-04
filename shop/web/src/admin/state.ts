import { reactive } from 'vue';
import { adminApi } from './api';

/** Who is signed in, and how many orders wait for a payment check (shown on the nav). */
export const adminState = reactive({ username: '', pendingOrders: 0 });

export async function ensureAdmin(): Promise<boolean> {
  if (adminState.username) return true;
  try {
    adminState.username = (await adminApi.me()).username;
    return true;
  } catch {
    return false;
  }
}

export async function refreshPending(): Promise<void> {
  try {
    adminState.pendingOrders = (await adminApi.summary()).pending_orders;
  } catch {
    // the badge just stays as it was
  }
}

// ---- toasts ----
export interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'error';
}
export const toasts = reactive<Toast[]>([]);
let toastId = 0;

export function toast(text: string, tone: Toast['tone'] = 'ok'): void {
  const id = ++toastId;
  toasts.push({ id, text, tone });
  setTimeout(() => {
    const index = toasts.findIndex((t) => t.id === id);
    if (index >= 0) toasts.splice(index, 1);
  }, tone === 'error' ? 4000 : 2400);
}

// ---- confirm dialog ----
export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

export const confirmState = reactive<{
  open: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  danger: boolean;
  resolve: ((ok: boolean) => void) | null;
}>({ open: false, title: '', message: '', confirmText: '确定', cancelText: '取消', danger: false, resolve: null });

export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  confirmState.resolve?.(false);
  return new Promise((resolve) => {
    Object.assign(confirmState, {
      open: true,
      title: options.title,
      message: options.message,
      confirmText: options.confirmText ?? '确定',
      cancelText: options.cancelText ?? '取消',
      danger: options.danger ?? false,
      resolve,
    });
  });
}

export function settleConfirm(ok: boolean): void {
  const resolve = confirmState.resolve;
  confirmState.open = false;
  confirmState.resolve = null;
  resolve?.(ok);
}
