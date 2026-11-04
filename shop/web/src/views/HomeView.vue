<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, type ProductSummary } from '../api';
import HtmlContent from '../components/HtmlContent.vue';
import ProductCard from '../components/ProductCard.vue';
import { errorMessage } from '../format';
import { shopState } from '../shop';

const route = useRoute();
const router = useRouter();

const products = ref<ProductSummary[]>([]);
const loading = ref(true);
const error = ref('');

const activeCategory = computed(() => {
  const id = Number(route.query.c);
  return Number.isInteger(id) && id > 0 ? id : 0;
});

/** Only categories that have something on the shelf. */
const categories = computed(() => {
  const used = new Set(products.value.map((p) => p.category_id));
  return (shopState.shop?.categories ?? []).filter((c) => used.has(c.id));
});

const visible = computed(() =>
  activeCategory.value ? products.value.filter((p) => p.category_id === activeCategory.value) : products.value,
);

function pick(id: number) {
  router.replace({ query: id ? { c: String(id) } : {} });
}

onMounted(async () => {
  if (shopState.shop) document.title = shopState.shop.shop_name;
  try {
    products.value = await api.products();
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="space-y-4 sm:space-y-5">
    <section v-if="shopState.shop?.notice" class="card overflow-hidden">
      <div class="flex items-center gap-2 border-b border-slate-100 bg-amber-50/60 px-4 py-2.5">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-4 w-4 text-amber-600" aria-hidden="true">
          <path d="M3.5 8.5v3h2.5l5 3.5v-10L6 8.5H3.5Z" stroke-linejoin="round" />
          <path d="M14 7.5a3.5 3.5 0 0 1 0 5" stroke-linecap="round" />
        </svg>
        <h2 class="text-sm font-semibold text-amber-800">店铺公告</h2>
      </div>
      <HtmlContent :html="shopState.shop.notice" class="px-4 py-3 text-sm leading-6" />
    </section>

    <nav v-if="categories.length > 1" class="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="商品分类">
      <div class="flex w-max gap-2">
        <button
          type="button"
          class="rounded-full px-4 py-1.5 text-sm font-medium ring-1 ring-inset transition"
          :class="activeCategory === 0 ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-100'"
          @click="pick(0)"
        >
          全部
        </button>
        <button
          v-for="category in categories"
          :key="category.id"
          type="button"
          class="rounded-full px-4 py-1.5 text-sm font-medium ring-1 ring-inset transition"
          :class="activeCategory === category.id ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-100'"
          @click="pick(category.id)"
        >
          {{ category.name }}
        </button>
      </div>
    </nav>

    <p v-if="error" class="card p-6 text-center text-sm text-rose-600">{{ error }}</p>

    <div v-else-if="loading" class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      <div v-for="n in 8" :key="n" class="card overflow-hidden">
        <div class="aspect-square animate-pulse bg-slate-100" />
        <div class="space-y-2 p-3">
          <div class="h-4 animate-pulse rounded bg-slate-100" />
          <div class="h-4 w-1/2 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
    </div>

    <p v-else-if="visible.length === 0" class="card p-10 text-center text-sm text-slate-500">这里暂时没有商品</p>

    <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      <ProductCard v-for="product in visible" :key="product.id" :product="product" />
    </div>
  </div>
</template>
