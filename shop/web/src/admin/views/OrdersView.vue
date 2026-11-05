<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { OrderStatus } from '../../api';
import CopyButton from '../../components/CopyButton.vue';
import StatusBadge from '../../components/StatusBadge.vue';
import { errorMessage, formatTime, PAY_TEXT, yuanExact } from '../../format';
import { adminApi, type AdminOrder } from '../api';
import { adminState, askConfirm, refreshOrderBadge, toast } from '../state';

type Tab = OrderStatus | 'all';
// Buyers mark their own orders paid, so the paid ones are what customer service works through.
const TABS: { key: Tab; label: string }[] = [
  { key: 'paid', label: '已付款' },
  { key: 'pending', label: '待付款' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
  { key: 'all', label: '全部' },
];
const PAGE = 20;
const vFocus = { mounted: (el: HTMLElement) => el.focus() };

const tab = ref<Tab>('paid');
const q = ref('');
const from = ref('');
const to = ref('');
const items = ref<AdminOrder[]>([]);
const total = ref(0);
const counts = ref<Record<OrderStatus, number>>({ pending: 0, paid: 0, completed: 0, cancelled: 0 });
const loading = ref(false);
const busyId = ref<number | null>(null);
const noteId = ref<number | null>(null);
const noteDraft = ref('');

const countFor = (key: Tab) =>
  key === 'all' ? Object.values(counts.value).reduce((sum, n) => sum + n, 0) : counts.value[key];
const hasFilters = computed(() => Boolean(q.value || from.value || to.value));

let latest = 0;
async function load(more = false) {
  // Switching tabs or typing fires overlapping requests; only the newest one may fill the list.
  const ticket = ++latest;
  loading.value = true;
  try {
    const page = await adminApi.orders({
      status: tab.value === 'all' ? undefined : tab.value,
      q: q.value.trim() || undefined,
      from: from.value || undefined,
      to: to.value || undefined,
      limit: PAGE,
      offset: more ? items.value.length : 0,
    });
    if (ticket !== latest) return;
    items.value = more ? [...items.value, ...page.items] : page.items;
    total.value = page.total;
    counts.value = page.counts;
  } catch (e) {
    if (ticket === latest) toast(errorMessage(e), 'error');
  } finally {
    if (ticket === latest) loading.value = false;
  }
}

watch(tab, () => load());
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch([q, from, to], () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => load(), 300);
});

let refresher: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  void load();
  // New orders show up without a reload while the page sits open on the first page.
  refresher = setInterval(() => {
    if (document.visibilityState === 'visible' && items.value.length <= PAGE && noteId.value === null && busyId.value === null) void load();
  }, 30_000);
});
onBeforeUnmount(() => {
  clearInterval(refresher);
  clearTimeout(searchTimer);
});
watch(
  () => adminState.ordersToHandle,
  (n) => {
    document.title = `${n > 0 ? `(${n}) ` : ''}订单 - 管理后台`;
  },
  { immediate: true },
);

async function run(order: AdminOrder, action: () => Promise<AdminOrder>, done: string) {
  busyId.value = order.id;
  try {
    await action();
    toast(done);
    await Promise.all([load(), refreshOrderBadge()]);
  } catch (e) {
    toast(errorMessage(e), 'error');
  } finally {
    busyId.value = null;
  }
}

async function confirmPayment(order: AdminOrder) {
  const late = order.status === 'cancelled' ? '\n这笔订单已超时取消，确认后会恢复为已付款。' : '';
  const ok = await askConfirm({
    title: '确认收款',
    message: `请先在${PAY_TEXT[order.pay_method]}账单里核对：\n金额 ¥${yuanExact(order.amount)}，订单 ${order.order_no}，手机号 ${order.phone}。\n确认后买家会看到卡密。${late}`,
    confirmText: '已收到，确认',
  });
  if (ok) await run(order, () => adminApi.confirmOrder(order.id), '已确认收款');
}

async function complete(order: AdminOrder) {
  const ok = await askConfirm({ title: '标记完成', message: `确认已为订单 ${order.order_no} 办理完成？`, confirmText: '标记完成' });
  if (ok) await run(order, () => adminApi.completeOrder(order.id), '订单已完成');
}

async function cancel(order: AdminOrder) {
  // Buyers mark orders paid themselves, so a paid order may have no money behind it.
  const message =
    order.status === 'paid'
      ? `${PAY_TEXT[order.pay_method]}账单里没有收到订单 ${order.order_no} 的 ¥${yuanExact(order.amount)}？\n取消后库存会退回，买家看不到卡密。之后如果收到了钱，仍然可以在“已取消”里确认收款。`
      : `取消订单 ${order.order_no}？库存会退回。买家如果之后付了款，仍然可以在“已取消”里确认收款。`;
  const ok = await askConfirm({
    title: '取消订单',
    message,
    confirmText: '取消订单',
    cancelText: '不取消',
    danger: true,
  });
  if (ok) await run(order, () => adminApi.cancelOrder(order.id), '订单已取消');
}

function editNote(order: AdminOrder) {
  noteId.value = order.id;
  noteDraft.value = order.admin_note;
}

async function saveNote(order: AdminOrder) {
  busyId.value = order.id;
  try {
    const updated = await adminApi.noteOrder(order.id, noteDraft.value);
    order.admin_note = updated.admin_note;
    noteId.value = null;
    toast('备注已保存');
  } catch (e) {
    toast(errorMessage(e), 'error');
  } finally {
    busyId.value = null;
  }
}

function clearFilters() {
  q.value = '';
  from.value = '';
  to.value = '';
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <button
        v-for="item in TABS"
        :key="item.key"
        type="button"
        class="rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 ring-inset transition"
        :class="tab === item.key ? 'bg-stone-900 text-white ring-stone-900' : 'bg-white text-stone-600 ring-stone-200 hover:bg-stone-100'"
        @click="tab = item.key"
      >
        {{ item.label }}
        <span class="ml-0.5 tabular-nums" :class="tab === item.key ? 'text-stone-300' : 'text-stone-400'">{{ countFor(item.key) }}</span>
      </button>
    </div>

    <div class="card flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
      <input v-model="q" type="search" placeholder="搜索手机号或订单号" class="input h-10 sm:max-w-xs" />
      <div class="flex items-center gap-2">
        <input v-model="from" type="date" class="input h-10 min-w-0 flex-1 px-2 text-sm sm:w-40 sm:flex-none" aria-label="开始日期" />
        <span class="text-stone-400">–</span>
        <input v-model="to" type="date" class="input h-10 min-w-0 flex-1 px-2 text-sm sm:w-40 sm:flex-none" aria-label="结束日期" />
      </div>
      <button v-if="hasFilters" type="button" class="text-sm text-blue-600 sm:ml-1" @click="clearFilters">清除筛选</button>
    </div>

    <p v-if="!loading && items.length === 0" class="card p-10 text-center text-sm text-stone-500">
      {{ hasFilters ? '没有符合条件的订单' : tab === 'paid' ? '没有要办理的订单' : tab === 'pending' ? '没有待付款的订单' : '暂无订单' }}
    </p>

    <ul class="space-y-3">
      <li v-for="order in items" :key="order.id">
        <article class="card p-4" :class="{ 'ring-2 ring-amber-300': order.status === 'paid' }">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="font-mono text-[15px] font-semibold tracking-wide text-stone-900">{{ order.order_no }}</span>
            <CopyButton :text="order.order_no" />
            <StatusBadge :status="order.status" />
            <span class="ml-auto text-xs text-stone-400">{{ formatTime(order.created_at) }}</span>
          </div>

          <div class="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[1fr_auto]">
            <p class="text-stone-900">{{ order.product_name }} <span class="text-stone-500">× {{ order.quantity }}</span></p>
            <p class="sm:text-right">
              <span class="text-lg font-bold text-stone-900 tabular-nums">¥{{ yuanExact(order.amount) }}</span>
              <span class="ml-1.5 font-medium" :class="order.pay_method === 'wechat' ? 'text-wechat' : 'text-alipay'">{{ PAY_TEXT[order.pay_method] }}</span>
            </p>
            <p class="flex items-center gap-2 text-stone-500">
              手机号 <span class="font-medium text-stone-900 tabular-nums">{{ order.phone }}</span>
              <CopyButton :text="order.phone" />
            </p>
            <p v-if="order.paid_at" class="text-stone-500 sm:text-right">付款 {{ formatTime(order.paid_at) }}</p>
            <p v-else-if="order.status === 'pending'" class="text-amber-700 sm:text-right">{{ formatTime(order.expire_at) }} 前未付款会自动取消</p>
            <p v-else-if="order.cancelled_at" class="text-stone-500 sm:text-right">取消于 {{ formatTime(order.cancelled_at) }}</p>
          </div>

          <p v-if="order.cards.length" class="mt-2 text-xs leading-5 break-all text-stone-500">已发卡密：{{ order.cards.join('、') }}</p>

          <div v-if="noteId === order.id" class="mt-3 flex gap-2">
            <input
              v-model="noteDraft"
              v-focus
              class="input h-10 min-w-0 text-sm"
              maxlength="500"
              placeholder="内部备注，买家看不到"
              @keydown.enter.prevent="saveNote(order)"
              @keydown.esc="noteId = null"
            />
            <button type="button" class="btn-primary h-10 shrink-0 px-4 text-sm" :disabled="busyId === order.id" @click="saveNote(order)">保存</button>
            <button type="button" class="btn-secondary h-10 shrink-0 px-3 text-sm" @click="noteId = null">取消</button>
          </div>
          <p v-else-if="order.admin_note" class="mt-2 rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-600">备注：{{ order.admin_note }}</p>

          <div class="mt-3 flex flex-wrap gap-2 border-t border-stone-100 pt-3">
            <button
              v-if="order.status === 'pending' || order.status === 'cancelled'"
              type="button"
              class="btn-primary h-9 px-4 text-sm"
              :disabled="busyId === order.id"
              @click="confirmPayment(order)"
            >确认收款</button>
            <button v-if="order.status === 'paid'" type="button" class="btn-primary h-9 bg-emerald-600 px-4 text-sm hover:bg-emerald-700" :disabled="busyId === order.id" @click="complete(order)">
              标记完成
            </button>
            <button
              v-if="order.status === 'pending' || order.status === 'paid'"
              type="button"
              class="btn-secondary h-9 px-4 text-sm"
              :disabled="busyId === order.id"
              @click="cancel(order)"
            >
              取消订单
            </button>
            <button v-if="noteId !== order.id" type="button" class="btn-secondary h-9 px-4 text-sm" @click="editNote(order)">
              {{ order.admin_note ? '改备注' : '备注' }}
            </button>
          </div>
        </article>
      </li>
    </ul>

    <div v-if="items.length < total" class="text-center">
      <button type="button" class="btn-secondary" :disabled="loading" @click="load(true)">{{ loading ? '加载中…' : `加载更多（还有 ${total - items.length} 笔）` }}</button>
    </div>
  </div>
</template>
