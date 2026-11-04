<script setup lang="ts">
import type { ProductSummary } from '../api';
import PriceTag from './PriceTag.vue';
import StockBadge from './StockBadge.vue';

defineProps<{ product: ProductSummary }>();
</script>

<template>
  <RouterLink
    :to="`/p/${product.id}`"
    class="group flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/80 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/70"
  >
    <div class="relative aspect-square overflow-hidden bg-slate-100">
      <img
        v-if="product.image"
        :src="product.image"
        :alt="product.name"
        loading="lazy"
        class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
        :class="{ 'opacity-60 grayscale': product.stock_status === 'out' }"
      />
      <span
        v-if="product.stock_status === 'out'"
        class="absolute top-2 left-2 rounded-full bg-slate-900/75 px-2 py-0.5 text-xs font-medium text-white"
      >已售罄</span>
    </div>
    <div class="flex flex-1 flex-col gap-2 p-3">
      <h3 class="line-clamp-2 text-sm leading-5 font-semibold text-slate-900">{{ product.name }}</h3>
      <div class="mt-auto flex items-end justify-between gap-2">
        <PriceTag :price="product.price" :original="product.original_price" />
        <StockBadge v-if="product.stock_status !== 'out'" :status="product.stock_status" />
      </div>
    </div>
  </RouterLink>
</template>
