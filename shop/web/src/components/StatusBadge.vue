<script setup lang="ts">
import type { OrderStatus } from '../api';
import { STATUS_TEXT } from '../format';

defineProps<{ status: OrderStatus }>();

const tone: Record<OrderStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  paid: 'bg-blue-50 text-blue-700 ring-blue-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cancelled: 'bg-slate-100 text-slate-500 ring-slate-200',
};
</script>

<template>
  <span class="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset" :class="tone[status]">
    {{ STATUS_TEXT[status] }}
  </span>
</template>
