<script setup lang="ts">
import type { StockStatus } from '../api';

defineProps<{ status: StockStatus }>();

const label: Record<StockStatus, string> = { in_stock: '有货', low: '库存紧张', out: '缺货' };
const tone: Record<StockStatus, string> = {
  in_stock: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  low: 'bg-amber-50 text-amber-700 ring-amber-200',
  out: 'bg-slate-100 text-slate-500 ring-slate-200',
};
</script>

<template>
  <span class="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset" :class="tone[status]">
    {{ label[status] }}
  </span>
</template>
