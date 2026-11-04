<script setup lang="ts">
import { onMounted } from 'vue';
import AppFooter from './components/AppFooter.vue';
import AppHeader from './components/AppHeader.vue';
import { loadShop } from './shop';

onMounted(loadShop);
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <AppHeader />
    <main class="mx-auto w-full max-w-5xl flex-1 px-4 pt-4 pb-12 sm:px-6 sm:pt-6">
      <RouterView />
    </main>
    <AppFooter />
  </div>
</template>
