<script setup lang="ts">
import { computed } from 'vue';
import { shopState } from '../shop';

const shop = computed(() => shopState.shop);
const year = new Date().getFullYear();
</script>

<template>
  <footer class="border-t border-slate-200 bg-white">
    <div class="mx-auto max-w-5xl px-4 py-6 text-center text-xs leading-6 text-slate-500 sm:px-6">
      <p v-if="shop && (shop.contact_wechat || shop.contact_qq)">
        客服
        <span v-if="shop.contact_wechat">· 微信 {{ shop.contact_wechat }}</span>
        <span v-if="shop.contact_qq"> · QQ {{ shop.contact_qq }}</span>
      </p>
      <p>© {{ year }} {{ shop?.shop_name }}</p>
    </div>
  </footer>
</template>
