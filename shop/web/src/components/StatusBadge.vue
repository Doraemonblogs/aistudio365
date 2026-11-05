<script setup lang="ts">
import type { OrderStatus } from '../api';
import { STATUS_TEXT } from '../format';

defineProps<{ status: OrderStatus }>();

const tone: Record<OrderStatus, string> = {
  pending: 'bg-amber-100/70 text-amber-800',
  paid: 'bg-sky-100/70 text-sky-800',
  completed: 'bg-emerald-100/70 text-emerald-800',
  cancelled: 'bg-stone-200/60 text-stone-500',
};
</script>

<template>
  <span class="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium" :class="tone[status]">
    {{ STATUS_TEXT[status] }}
  </span>
</template>
