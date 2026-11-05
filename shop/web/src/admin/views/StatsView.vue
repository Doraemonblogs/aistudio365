<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { errorMessage, yuanShort } from '../../format';
import { adminApi, type DailySales, type ProductSales, type SalesSummary } from '../api';
import SalesChart from '../components/SalesChart.vue';
import { toast } from '../state';
import { beijingToday } from '../text';

const summary = ref<SalesSummary | null>(null);
const daily = ref<DailySales[]>([]);
const days = ref(30);
const ranking = ref<ProductSales[]>([]);

const shiftDate = (date: string, deltaDays: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + deltaDays * 86_400_000).toISOString().slice(0, 10);

const today = beijingToday();
const PRESETS = [
  { key: 'month', label: '本月', from: `${today.slice(0, 8)}01`, to: today },
  { key: '30d', label: '近 30 天', from: shiftDate(today, -29), to: today },
  { key: 'year', label: '今年', from: `${today.slice(0, 5)}01-01`, to: today },
] as const;
const from = ref<string>(PRESETS[0].from);
const to = ref<string>(today);
const activePreset = computed(() => PRESETS.find((p) => p.from === from.value && p.to === to.value)?.key ?? null);

const tiles = computed(() =>
  summary.value
    ? [
        { label: '今日', figure: summary.value.today },
        { label: '本周', figure: summary.value.week },
        { label: '本月', figure: summary.value.month },
        { label: '累计', figure: summary.value.total },
      ]
    : [],
);

const dailyTotal = computed(() => daily.value.reduce((sum, r) => ({ amount: sum.amount + r.amount, orders: sum.orders + r.orders }), { amount: 0, orders: 0 }));
const rankingMax = computed(() => Math.max(1, ...ranking.value.map((r) => r.amount)));
const rankingTotal = computed(() => ranking.value.reduce((sum, r) => sum + r.amount, 0));

async function loadDaily() {
  try {
    daily.value = await adminApi.daily(days.value);
  } catch (e) {
    toast(errorMessage(e), 'error');
  }
}

async function loadRanking() {
  if (!from.value || !to.value) return;
  if (from.value > to.value) {
    toast('开始日期不能晚于结束日期', 'error');
    return;
  }
  try {
    ranking.value = await adminApi.productSales(from.value, to.value);
  } catch (e) {
    toast(errorMessage(e), 'error');
  }
}

onMounted(async () => {
  document.title = '统计 - 管理后台';
  try {
    summary.value = await adminApi.summary();
  } catch (e) {
    toast(errorMessage(e), 'error');
  }
});
watch(days, loadDaily, { immediate: true });
watch([from, to], loadRanking, { immediate: true });

function usePreset(preset: (typeof PRESETS)[number]) {
  from.value = preset.from;
  to.value = preset.to;
}
</script>

<template>
  <div class="space-y-4">
    <p class="px-1 text-xs text-stone-500">只统计已付款和已完成的订单，按北京时间计算。</p>

    <!-- Headline figures -->
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div v-for="tile in tiles" :key="tile.label" class="card p-4">
        <p class="text-sm text-stone-500">{{ tile.label }}</p>
        <p class="mt-1 text-2xl font-bold tracking-tight text-stone-900 tabular-nums">
          <span class="mr-px text-base">¥</span>{{ yuanShort(tile.figure.amount) }}
        </p>
        <p class="mt-0.5 text-xs text-stone-500 tabular-nums">{{ tile.figure.orders }} 单</p>
      </div>
      <template v-if="!summary">
        <div v-for="n in 4" :key="n" class="card h-[104px] animate-pulse" />
      </template>
    </div>

    <div v-if="summary && (summary.pending_orders > 0 || summary.paid_orders > 0)" class="flex flex-wrap gap-2 text-sm">
      <RouterLink v-if="summary.paid_orders > 0" to="/admin/orders" class="rounded-full bg-amber-50 px-3 py-1 text-amber-800 ring-1 ring-amber-200 ring-inset">
        {{ summary.paid_orders }} 单已付款、待办理 →
      </RouterLink>
      <span v-if="summary.pending_orders > 0" class="rounded-full bg-stone-100 px-3 py-1 text-stone-600 ring-1 ring-stone-200 ring-inset">
        {{ summary.pending_orders }} 单等待买家付款
      </span>
    </div>

    <!-- Daily sales -->
    <section class="card p-4 sm:p-5">
      <div class="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 class="text-base font-semibold text-stone-900">每日销售额</h2>
          <p class="mt-0.5 text-sm text-stone-500 tabular-nums">最近 {{ days }} 天合计 ¥{{ yuanShort(dailyTotal.amount) }} · {{ dailyTotal.orders }} 单</p>
        </div>
        <div class="flex rounded-lg bg-stone-100 p-0.5" role="group" aria-label="时间范围">
          <button
            v-for="n in [7, 30, 90]"
            :key="n"
            type="button"
            class="rounded-md px-3 py-1 text-sm font-medium transition"
            :class="days === n ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'"
            :aria-pressed="days === n"
            @click="days = n"
          >{{ n }} 天</button>
        </div>
      </div>
      <SalesChart v-if="daily.length" :rows="daily" />
      <div v-else class="h-[220px] animate-pulse rounded-xl bg-stone-50" />
      <details class="group mt-3">
        <summary class="cursor-pointer text-sm text-blue-600 select-none">查看每日明细</summary>
        <div class="mt-2 max-h-80 overflow-y-auto rounded-xl ring-1 ring-stone-200">
          <table class="w-full text-sm">
            <thead class="sticky top-0 bg-stone-50 text-left text-xs text-stone-500">
              <tr>
                <th class="px-3 py-2 font-medium">日期</th>
                <th class="px-3 py-2 text-right font-medium">订单</th>
                <th class="px-3 py-2 text-right font-medium">销售额</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-stone-100 tabular-nums">
              <tr v-for="row in [...daily].reverse()" :key="row.date" :class="{ 'text-stone-400': row.orders === 0 }">
                <td class="px-3 py-1.5">{{ row.date }}</td>
                <td class="px-3 py-1.5 text-right">{{ row.orders }}</td>
                <td class="px-3 py-1.5 text-right">¥{{ yuanShort(row.amount) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </section>

    <!-- Product ranking -->
    <section class="card p-4 sm:p-5">
      <div class="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 class="text-base font-semibold text-stone-900">商品销量</h2>
          <p class="mt-0.5 text-sm text-stone-500 tabular-nums">合计 ¥{{ yuanShort(rankingTotal) }}</p>
        </div>
        <div class="flex flex-col gap-2 sm:items-end">
          <div class="flex gap-1.5">
            <button
              v-for="preset in PRESETS"
              :key="preset.key"
              type="button"
              class="rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset"
              :class="activePreset === preset.key ? 'bg-stone-900 text-white ring-stone-900' : 'bg-white text-stone-600 ring-stone-200 hover:bg-stone-50'"
              @click="usePreset(preset)"
            >{{ preset.label }}</button>
          </div>
          <div class="flex items-center gap-2">
            <input v-model="from" type="date" :max="today" class="input h-9 min-w-0 flex-1 px-2 text-sm sm:w-36 sm:flex-none" aria-label="开始日期" />
            <span class="text-stone-400">–</span>
            <input v-model="to" type="date" :max="today" class="input h-9 min-w-0 flex-1 px-2 text-sm sm:w-36 sm:flex-none" aria-label="结束日期" />
          </div>
        </div>
      </div>

      <p v-if="ranking.length === 0" class="rounded-xl bg-stone-50 px-3 py-8 text-center text-sm text-stone-500">这段时间没有成交</p>
      <ol v-else class="space-y-3">
        <li v-for="(row, i) in ranking" :key="row.product_id ?? row.product_name">
          <div class="flex items-baseline justify-between gap-3 text-sm">
            <span class="min-w-0 truncate text-stone-900">
              <span class="mr-1.5 inline-block w-4 text-right text-stone-400 tabular-nums">{{ i + 1 }}</span>{{ row.product_name }}
            </span>
            <span class="shrink-0 text-stone-500 tabular-nums">
              {{ row.quantity }} 件 · {{ row.orders }} 单 · <span class="font-semibold text-stone-900">¥{{ yuanShort(row.amount) }}</span>
            </span>
          </div>
          <div class="mt-1.5 ml-[22px] h-1.5 rounded-full bg-stone-100">
            <div class="h-1.5 rounded-full bg-blue-600" :style="{ width: `${Math.max(1, (row.amount / rankingMax) * 100)}%` }" />
          </div>
        </li>
      </ol>
    </section>
  </div>
</template>
