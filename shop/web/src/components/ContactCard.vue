<script setup lang="ts">
import { computed } from 'vue';
import { shopState } from '../shop';
import CopyButton from './CopyButton.vue';

const shop = computed(() => shopState.shop);
</script>

<template>
  <section v-if="shop && (shop.contact_wechat || shop.contact_qq)" class="card p-4 sm:p-5">
    <h2 class="text-base font-semibold text-slate-900">商家联系方式</h2>
    <p v-if="$slots.default" class="mt-1 text-sm leading-6 text-slate-500"><slot /></p>
    <div class="mt-2 divide-y divide-slate-100">
      <div v-if="shop.contact_wechat" class="flex items-center justify-between gap-3 py-2.5">
        <span class="text-[15px]"><span class="text-slate-500">微信：</span><span class="font-semibold text-slate-900">{{ shop.contact_wechat }}</span></span>
        <CopyButton :text="shop.contact_wechat" />
      </div>
      <div v-if="shop.contact_qq" class="flex items-center justify-between gap-3 py-2.5">
        <span class="text-[15px]"><span class="text-slate-500">QQ：</span><span class="font-semibold text-slate-900">{{ shop.contact_qq }}</span></span>
        <CopyButton :text="shop.contact_qq" />
      </div>
    </div>
  </section>
</template>
