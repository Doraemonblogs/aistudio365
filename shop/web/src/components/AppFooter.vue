<script setup lang="ts">
import { computed } from 'vue';
import { shopState } from '../shop';

const shop = computed(() => shopState.shop);
const year = new Date().getFullYear();
</script>

<template>
  <footer class="mx-auto w-full max-w-5xl px-5 pt-4 pb-10 text-center text-xs leading-6 text-stone-400 sm:px-8">
    <p v-if="shop && (shop.contact_wechat || shop.contact_qq)">
      <span v-if="shop.contact_wechat">客服微信 {{ shop.contact_wechat }}</span>
      <span v-if="shop.contact_wechat && shop.contact_qq" class="mx-2">·</span>
      <span v-if="shop.contact_qq">QQ {{ shop.contact_qq }}</span>
    </p>
    <p>© {{ year }} {{ shop?.shop_name }}</p>
  </footer>
</template>
