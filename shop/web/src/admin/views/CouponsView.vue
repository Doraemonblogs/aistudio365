<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import CopyButton from '../../components/CopyButton.vue';
import StatusBadge from '../../components/StatusBadge.vue';
import { copyText, couponCondition, couponDates, couponText, errorMessage, formatTime } from '../../format';
import { adminApi, type AdminCoupon, type AdminProduct, type CouponState } from '../api';
import { askConfirm, toast } from '../state';

type Tab = CouponState | 'all';
const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '可用' },
  { key: 'scheduled', label: '未开始' },
  { key: 'used', label: '已用完' },
  { key: 'expired', label: '已过期' },
  { key: 'off', label: '已停用' },
];
const STATE: Record<CouponState, { text: string; tone: string }> = {
  active: { text: '可用', tone: 'bg-emerald-50 text-emerald-700' },
  scheduled: { text: '未开始', tone: 'bg-sky-50 text-sky-700' },
  used: { text: '已用完', tone: 'bg-stone-100 text-stone-600' },
  expired: { text: '已过期', tone: 'bg-stone-100 text-stone-400' },
  off: { text: '已停用', tone: 'bg-rose-50 text-rose-600' },
};
const PAGE = 100;

const coupons = ref<AdminCoupon[]>([]);
const products = ref<AdminProduct[]>([]);
const loading = ref(true);
const tab = ref<Tab>('all');
const q = ref('');
const shown = ref(PAGE);

async function load() {
  loading.value = true;
  try {
    const [list, items] = await Promise.all([adminApi.coupons(), products.value.length ? products.value : adminApi.products()]);
    coupons.value = list;
    products.value = items;
    const ids = new Set(list.map((c) => c.id));
    for (const id of selected) if (!ids.has(id)) selected.delete(id);
  } catch (e) {
    toast(errorMessage(e), 'error');
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const productName = computed(() => new Map(products.value.map((p) => [p.id, p.name])));
const counts = computed(() => {
  const result: Record<Tab, number> = { all: coupons.value.length, active: 0, scheduled: 0, used: 0, expired: 0, off: 0 };
  for (const c of coupons.value) result[c.state]++;
  return result;
});
const filtered = computed(() => {
  const term = q.value.trim().toUpperCase();
  return coupons.value.filter(
    (c) =>
      (tab.value === 'all' || c.state === tab.value) &&
      (!term ||
        c.code.includes(term) ||
        c.name.toUpperCase().includes(term) ||
        Boolean(c.use && (c.use.phone.includes(term) || c.use.order_no.includes(term)))),
  );
});
const visible = computed(() => filtered.value.slice(0, shown.value));
watch([tab, q], () => {
  shown.value = PAGE;
  selected.clear();
});

function scope(c: AdminCoupon): string {
  if (c.product_ids.length === 0) return '全部商品';
  const names = c.product_ids.map((id) => productName.value.get(id) ?? `商品 ${id}`);
  return names.length > 2 ? `${names.slice(0, 2).join('、')} 等 ${names.length} 个商品` : names.join('、');
}

function usage(c: AdminCoupon): string {
  if (!c.use) return '未使用';
  return c.use.status === 'pending' ? '待付款订单占用中' : '已使用';
}

// ---- batch ----
const selected = reactive(new Set<number>());
const busy = ref(false);
const allSelected = computed(() => visible.value.length > 0 && visible.value.every((c) => selected.has(c.id)));
const selectedCoupons = computed(() => coupons.value.filter((c) => selected.has(c.id)));

function toggle(c: AdminCoupon) {
  if (selected.has(c.id)) selected.delete(c.id);
  else selected.add(c.id);
}
function toggleAll() {
  if (allSelected.value) selected.clear();
  else for (const c of visible.value) selected.add(c.id);
}

async function copySelected() {
  const ok = await copyText(selectedCoupons.value.map((c) => c.code).join('\n'));
  toast(ok ? `已复制 ${selected.size} 个券码` : '复制失败，请手动选择', ok ? 'ok' : 'error');
}

async function runBatch(action: 'enable' | 'disable' | 'delete') {
  const n = selected.size;
  const label = { enable: '启用', disable: '停用', delete: '删除' }[action];
  const message = {
    enable: `启用这 ${n} 张优惠券？已过期或已用完的仍然不能用。`,
    disable: `停用这 ${n} 张优惠券？停用后买家不能再用，已经下的订单不受影响。`,
    delete: `删除这 ${n} 张优惠券？已经用在订单上的不能删除，会跳过，可以改为停用。`,
  }[action];
  const ok = await askConfirm({ title: `批量${label}`, message, confirmText: `${label} ${n} 张`, danger: action !== 'enable' });
  if (!ok) return;
  busy.value = true;
  try {
    const result = await adminApi.batchCoupons(action, [...selected]);
    if (result.failed.length) {
      toast(`${label}：${result.done} 张成功，${result.failed.length} 张没处理（${result.failed[0]!.error}）`, 'error');
    } else {
      toast(`已${label} ${result.done} 张`);
    }
    selected.clear();
    await load();
  } catch (e) {
    toast(errorMessage(e), 'error');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold text-stone-900">优惠券</h1>
        <p class="mt-1 text-sm text-stone-500">生成券码发给客户，买家下单时填写券码即可。每张券只能用一次，谁拿到都能用。</p>
      </div>
      <RouterLink to="/admin/marketing/new" class="btn-primary h-10 px-5 text-sm">新建优惠券</RouterLink>
    </div>

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
        <span class="ml-0.5 tabular-nums" :class="tab === item.key ? 'text-stone-300' : 'text-stone-400'">{{ counts[item.key] }}</span>
      </button>
      <input v-model="q" type="search" placeholder="搜索券码、名称、订单号或手机号" class="input h-10 sm:ml-auto sm:max-w-xs" />
    </div>

    <p v-if="loading && coupons.length === 0" class="card p-10 text-center text-sm text-stone-500">正在加载…</p>
    <div v-else-if="coupons.length === 0" class="card p-10 text-center">
      <p class="text-sm text-stone-500">还没有优惠券</p>
      <RouterLink to="/admin/marketing/new" class="btn-primary mt-4 h-10 px-5 text-sm">新建第一批</RouterLink>
    </div>
    <p v-else-if="filtered.length === 0" class="card p-10 text-center text-sm text-stone-500">没有符合条件的优惠券</p>

    <template v-else>
      <div class="flex items-center justify-between px-1 text-sm text-stone-500">
        <label class="inline-flex cursor-pointer items-center gap-2 select-none">
          <input
            type="checkbox"
            class="h-4 w-4 accent-stone-900"
            :checked="allSelected"
            :indeterminate="selected.size > 0 && !allSelected"
            @change="toggleAll"
          />
          全选 {{ visible.length }} 张
        </label>
        <span v-if="selected.size" class="text-stone-700">已选 {{ selected.size }} 张</span>
        <span v-else class="text-xs text-stone-400">共 {{ filtered.length }} 张</span>
      </div>

      <ul class="space-y-3" :class="{ 'pb-20': selected.size }">
        <li v-for="c in visible" :key="c.id">
          <article class="card p-4" :class="{ 'ring-2 ring-stone-900': selected.has(c.id), 'opacity-70': c.state === 'expired' || c.state === 'off' }">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
              <input
                type="checkbox"
                class="mr-1 h-4 w-4 shrink-0 cursor-pointer accent-stone-900"
                :checked="selected.has(c.id)"
                :aria-label="`选择优惠券 ${c.code}`"
                @change="toggle(c)"
              />
              <span class="font-mono text-[15px] font-semibold tracking-wide text-stone-900">{{ c.code }}</span>
              <CopyButton :text="c.code" />
              <span class="rounded-full px-2 py-0.5 text-xs font-medium" :class="STATE[c.state].tone">{{ STATE[c.state].text }}</span>
              <span v-if="c.name" class="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">{{ c.name }}</span>
              <span class="ml-auto text-xs text-stone-400">创建于 {{ formatTime(c.created_at) }}</span>
            </div>

            <div class="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[1fr_auto]">
              <p>
                <span class="text-base font-semibold text-accent">{{ couponText(c) }}</span>
                <span class="ml-2 text-stone-500">{{ couponCondition(c) }} · {{ scope(c) }}</span>
              </p>
              <p class="text-stone-500 sm:text-right">{{ couponDates(c) }}</p>
              <p :class="c.use ? 'font-medium text-stone-900' : 'text-stone-500'">{{ usage(c) }}</p>
            </div>

            <div v-if="c.use" class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-stone-100 pt-3 text-sm">
              <span class="font-mono text-stone-800">{{ c.use.order_no }}</span>
              <StatusBadge :status="c.use.status" />
              <span class="text-stone-500 tabular-nums">{{ c.use.phone }}</span>
              <span class="text-stone-500">实付 ¥{{ (c.use.amount / 100).toFixed(2) }}，优惠 ¥{{ (c.use.discount / 100).toFixed(2) }}</span>
              <span class="ml-auto text-xs text-stone-400">{{ formatTime(c.use.created_at) }}</span>
            </div>
          </article>
        </li>
      </ul>

      <div v-if="filtered.length > shown" class="text-center">
        <button type="button" class="btn-secondary" @click="shown += PAGE">显示更多（还有 {{ filtered.length - shown }} 张）</button>
      </div>
    </template>

    <div v-if="selected.size" class="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
      <div class="flex max-w-full flex-wrap items-center gap-1.5 rounded-2xl bg-stone-900 p-2 text-sm text-white shadow-2xl">
        <span class="px-2 font-medium">已选 {{ selected.size }} 张</span>
        <button type="button" class="rounded-xl bg-white px-3 py-1.5 font-medium text-stone-900 hover:bg-stone-100" @click="copySelected">复制券码</button>
        <button type="button" class="rounded-xl bg-white/10 px-3 py-1.5 font-medium hover:bg-white/20 disabled:opacity-50" :disabled="busy" @click="runBatch('enable')">启用</button>
        <button type="button" class="rounded-xl bg-white/10 px-3 py-1.5 font-medium hover:bg-white/20 disabled:opacity-50" :disabled="busy" @click="runBatch('disable')">停用</button>
        <button type="button" class="rounded-xl bg-rose-500/90 px-3 py-1.5 font-medium hover:bg-rose-600 disabled:opacity-50" :disabled="busy" @click="runBatch('delete')">删除</button>
        <button type="button" class="rounded-xl px-2.5 py-1.5 text-stone-400 hover:text-white" @click="selected.clear()">取消选择</button>
      </div>
    </div>
  </div>
</template>
