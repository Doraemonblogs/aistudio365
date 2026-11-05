<script setup lang="ts">
import { yuanShort } from '../format';

withDefaults(defineProps<{ price: number; original?: number | null; large?: boolean }>(), {
  original: null,
  large: false,
});
</script>

<template>
  <span class="flex flex-wrap items-baseline gap-x-2">
    <span class="font-semibold tracking-tight text-accent tabular-nums" :class="large ? 'text-[34px] leading-none' : 'text-lg leading-6'">
      <span class="mr-0.5 font-medium" :class="large ? 'text-lg' : 'text-xs'">¥</span>{{ yuanShort(price) }}
    </span>
    <span v-if="original && original > price" class="text-stone-400 line-through" :class="large ? 'text-sm' : 'text-xs'">
      ¥{{ yuanShort(original) }}
    </span>
  </span>
</template>
