<script setup lang="ts">
import { useRoute } from 'vue-router';
import type { ProductSummary } from '../api';
import PriceTag from './PriceTag.vue';
import StockBadge from './StockBadge.vue';

defineProps<{ product: ProductSummary }>();
// The dialog opens over the list; keeping the query keeps the chosen category behind it.
const route = useRoute();
</script>

<template>
  <!-- No frame around the card: the picture carries it, name and price sit on the page. -->
  <RouterLink :to="{ path: `/p/${product.id}`, query: route.query }" class="group block outline-none">
    <div class="relative aspect-square overflow-hidden rounded-3xl bg-white shadow-soft transition duration-300 group-hover:-translate-y-1 group-focus-visible:ring-4 group-focus-visible:ring-stone-300">
      <img
        v-if="product.image"
        :src="product.image"
        :alt="product.name"
        loading="lazy"
        class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
        :class="{ 'opacity-50 grayscale': product.stock_status === 'out' }"
      />
    </div>
    <h3 class="mt-3 line-clamp-2 px-1 text-sm leading-6 text-stone-800 sm:text-[15px]">{{ product.name }}</h3>
    <div class="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 px-1">
      <PriceTag :price="product.price" :original="product.original_price" />
      <StockBadge :status="product.stock_status" />
    </div>
  </RouterLink>
</template>
