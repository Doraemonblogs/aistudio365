<script setup lang="ts">
import { shopState } from '../shop';
</script>

<template>
  <header class="sticky top-0 z-20 bg-paper/85 backdrop-blur-md">
    <div class="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-5 sm:px-8">
      <RouterLink to="/" class="flex min-w-0 items-center gap-2.5">
        <img v-if="shopState.shop?.logo" :src="shopState.shop.logo" alt="" class="h-9 w-9 shrink-0 rounded-full object-cover" />
        <span class="truncate text-[17px] font-semibold tracking-tight text-stone-900">{{ shopState.shop?.shop_name }}</span>
      </RouterLink>
      <RouterLink
        to="/orders"
        class="shrink-0 rounded-full px-4 py-2 text-sm text-stone-600 transition hover:bg-white hover:text-stone-900"
        active-class="bg-white text-stone-900"
      >
        查订单
      </RouterLink>
    </div>
  </header>
</template>
