<script setup lang="ts">
import type { StockStatus } from '../api';

defineProps<{ status: StockStatus }>();

const label: Record<StockStatus, string> = { plenty: '库存充足', medium: '库存一般', low: '仅剩少量', out: '缺货' };
const tone: Record<StockStatus, string> = {
  plenty: 'text-emerald-700',
  medium: 'text-sky-700',
  low: 'text-amber-700',
  out: 'text-stone-400',
};
const dot: Record<StockStatus, string> = { plenty: 'bg-emerald-500', medium: 'bg-sky-500', low: 'bg-amber-500', out: 'bg-stone-300' };
</script>

<template>
  <span class="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium whitespace-nowrap" :class="tone[status]">
    <span class="h-1.5 w-1.5 rounded-full" :class="dot[status]" aria-hidden="true" />
    {{ label[status] }}
  </span>
</template>
