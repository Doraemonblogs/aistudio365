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
const tabs = computed(() => [{ id: 0, name: '全部' }, ...categories.value]);

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
  <div class="space-y-8 sm:space-y-10">
    <section v-if="shopState.shop?.notice" class="rounded-3xl bg-sand/70 px-5 py-5 sm:px-8 sm:py-7">
      <p class="mb-2 flex items-center gap-2 text-xs font-medium tracking-[0.2em] text-stone-500">
        <span class="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />公告
      </p>
      <HtmlContent :html="shopState.shop.notice" class="text-[15px] leading-7 text-stone-700 [&_p]:my-0.5" />
    </section>

    <section class="space-y-5">
      <nav v-if="categories.length > 1" class="-mx-5 overflow-x-auto px-5 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden" aria-label="商品分类">
        <div class="flex w-max gap-1">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            class="rounded-full px-4 py-2 text-sm transition"
            :class="activeCategory === tab.id ? 'bg-stone-900 text-white' : 'text-stone-500 hover:bg-white hover:text-stone-900'"
            :aria-pressed="activeCategory === tab.id"
            @click="pick(tab.id)"
          >
            {{ tab.name }}
          </button>
        </div>
      </nav>

      <p v-if="error" class="py-16 text-center text-sm text-rose-600">{{ error }}</p>

      <div v-else-if="loading" class="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4">
        <div v-for="n in 8" :key="n">
          <div class="aspect-square animate-pulse rounded-3xl bg-stone-200/60" />
          <div class="mt-3 h-4 w-4/5 animate-pulse rounded-full bg-stone-200/60" />
          <div class="mt-2 h-4 w-1/3 animate-pulse rounded-full bg-stone-200/60" />
        </div>
      </div>

      <p v-else-if="visible.length === 0" class="py-16 text-center text-sm text-stone-400">这里暂时没有商品</p>

      <div v-else class="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4">
        <ProductCard v-for="product in visible" :key="product.id" :product="product" />
      </div>
    </section>

    <!-- The product dialog (/p/:id) -->
    <RouterView />
  </div>
</template>
