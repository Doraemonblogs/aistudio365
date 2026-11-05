<script setup lang="ts">
import { computed } from 'vue';
import { shopState } from '../shop';
import CopyButton from './CopyButton.vue';

const shop = computed(() => shopState.shop);
</script>

<template>
  <section v-if="shop && (shop.contact_wechat || shop.contact_qq)" class="rounded-3xl bg-sand/70 p-5 sm:p-6">
    <h2 class="text-[15px] font-semibold text-stone-900">联系客服</h2>
    <p v-if="$slots.default" class="mt-1 text-sm leading-6 text-stone-500"><slot /></p>
    <div class="mt-3 space-y-2">
      <div v-if="shop.contact_wechat" class="flex items-center justify-between gap-3 rounded-2xl bg-white/80 px-4 py-3">
        <span class="flex items-center gap-2.5 text-[15px]">
          <span class="h-2 w-2 rounded-full bg-wechat" aria-hidden="true" />
          <span class="text-stone-500">微信</span>
          <span class="font-semibold text-stone-900">{{ shop.contact_wechat }}</span>
        </span>
        <CopyButton :text="shop.contact_wechat" />
      </div>
      <div v-if="shop.contact_qq" class="flex items-center justify-between gap-3 rounded-2xl bg-white/80 px-4 py-3">
        <span class="flex items-center gap-2.5 text-[15px]">
          <span class="h-2 w-2 rounded-full bg-sky-500" aria-hidden="true" />
          <span class="text-stone-500">QQ</span>
          <span class="font-semibold text-stone-900">{{ shop.contact_qq }}</span>
        </span>
        <CopyButton :text="shop.contact_qq" />
      </div>
    </div>
  </section>
</template>
