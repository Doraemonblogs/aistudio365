<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import AppFooter from './components/AppFooter.vue';
import AppHeader from './components/AppHeader.vue';
import { loadShop } from './shop';

const route = useRoute();
/** The admin brings its own layout; the storefront chrome and shop data are only for buyers. */
const isAdmin = computed(() => route.path.startsWith('/admin'));

watch(
  isAdmin,
  (admin) => {
    if (!admin) void loadShop();
  },
  { immediate: true },
);
</script>

<template>
  <RouterView v-if="isAdmin" />
  <div v-else class="flex min-h-dvh flex-col">
    <AppHeader />
    <main class="mx-auto w-full max-w-5xl flex-1 px-5 pt-2 pb-16 sm:px-8 sm:pt-6">
      <RouterView />
    </main>
    <AppFooter />
  </div>
</template>
