<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, type OrderListItem } from '../api';
import PhoneForm from '../components/PhoneForm.vue';
import StatusBadge from '../components/StatusBadge.vue';
import { errorMessage, formatTime, rememberedPhone, rememberPhone, setTitle, yuanExact } from '../format';
import { shopState } from '../shop';

const phone = ref(rememberedPhone());
const orders = ref<OrderListItem[] | null>(null);
const searching = ref(false);
const error = ref('');

async function search(withPhone: string) {
  searching.value = true;
  error.value = '';
  try {
    orders.value = await api.orders(withPhone);
    phone.value = withPhone;
    rememberPhone(withPhone);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    searching.value = false;
  }
}

onMounted(() => {
  setTitle('查订单', shopState.shop?.shop_name);
  if (phone.value) void search(phone.value);
});
</script>

<template>
  <div class="mx-auto max-w-xl space-y-8">
    <section class="pt-2">
      <h1 class="text-2xl font-semibold tracking-tight text-stone-900">查订单</h1>
      <p class="mt-1.5 text-sm text-stone-500">输入下单时填写的手机号，查看这个号码的全部订单。</p>
      <div class="mt-5">
        <PhoneForm :key="phone" :initial="phone" :busy="searching" @submit="search" />
      </div>
      <p v-if="error" class="mt-3 text-sm text-rose-600" role="alert">{{ error }}</p>
    </section>

    <p v-if="orders && orders.length === 0" class="py-12 text-center text-sm text-stone-400">这个手机号还没有订单</p>

    <ul v-else-if="orders" class="space-y-3">
      <li v-for="item in orders" :key="item.order_no">
        <RouterLink :to="`/order/${item.order_no}`" class="card block p-5 transition hover:-translate-y-0.5">
          <div class="flex items-start justify-between gap-3">
            <p class="line-clamp-2 text-[15px] leading-6 font-medium text-stone-900">{{ item.product_name }}</p>
            <StatusBadge :status="item.status" />
          </div>
          <div class="mt-3 flex items-center justify-between gap-3 text-sm">
            <span class="text-stone-400 tabular-nums">{{ formatTime(item.created_at) }}</span>
            <span class="text-stone-500">× {{ item.quantity }}<span class="ml-2 font-semibold text-stone-900">¥{{ yuanExact(item.amount) }}</span></span>
          </div>
          <p class="mt-1 font-mono text-xs text-stone-400">{{ item.order_no }}</p>
        </RouterLink>
      </li>
    </ul>
  </div>
</template>
