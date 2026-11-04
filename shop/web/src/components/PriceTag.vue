<script setup lang="ts">
import { yuanShort } from '../format';

withDefaults(defineProps<{ price: number; original?: number | null; large?: boolean }>(), {
  original: null,
  large: false,
});
</script>

<template>
  <span class="flex flex-wrap items-baseline gap-x-1.5">
    <span class="font-bold tracking-tight text-rose-600" :class="large ? 'text-3xl' : 'text-lg leading-6'">
      <span class="mr-px font-semibold" :class="large ? 'text-lg' : 'text-xs'">¥</span>{{ yuanShort(price) }}
    </span>
    <span v-if="original && original > price" class="text-slate-400 line-through" :class="large ? 'text-sm' : 'text-xs'">
      ¥{{ yuanShort(original) }}
    </span>
  </span>
</template>
