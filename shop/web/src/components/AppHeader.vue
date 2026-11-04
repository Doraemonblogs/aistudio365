<script setup lang="ts">
import { shopState } from '../shop';
</script>

<template>
  <header class="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur">
    <div class="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
      <RouterLink to="/" class="flex min-w-0 items-center gap-2.5">
        <img
          v-if="shopState.shop?.logo"
          :src="shopState.shop.logo"
          alt=""
          class="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-slate-200"
        />
        <span class="truncate text-[17px] font-bold tracking-tight text-slate-900">{{ shopState.shop?.shop_name }}</span>
      </RouterLink>
      <RouterLink
        to="/orders"
        class="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-4 w-4" aria-hidden="true">
          <rect x="4" y="3" width="12" height="14" rx="2" />
          <path d="M7.5 7.5h5M7.5 10.5h5M7.5 13.5h3" stroke-linecap="round" />
        </svg>
        查订单
      </RouterLink>
    </div>
  </header>
</template>
