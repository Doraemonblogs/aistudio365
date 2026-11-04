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
  <div class="mx-auto max-w-2xl space-y-4">
    <section class="card p-4 sm:p-5">
      <h1 class="text-lg font-bold text-slate-900">查订单</h1>
      <p class="mt-1 text-sm text-slate-500">输入下单时填写的手机号，查看这个号码的全部订单。</p>
      <div class="mt-4">
        <PhoneForm :key="phone" :initial="phone" :busy="searching" @submit="search" />
      </div>
      <p v-if="error" class="mt-3 text-sm text-rose-600" role="alert">{{ error }}</p>
    </section>

    <p v-if="orders && orders.length === 0" class="card p-10 text-center text-sm text-slate-500">这个手机号还没有订单</p>

    <ul v-else-if="orders" class="space-y-3">
      <li v-for="item in orders" :key="item.order_no">
        <RouterLink :to="`/order/${item.order_no}`" class="card block p-4 transition hover:ring-slate-300">
          <div class="flex items-start justify-between gap-3">
            <p class="line-clamp-2 text-[15px] leading-6 font-medium text-slate-900">{{ item.product_name }}</p>
            <StatusBadge :status="item.status" />
          </div>
          <div class="mt-2 flex items-center justify-between gap-3 text-sm text-slate-500">
            <span class="font-mono">{{ item.order_no }}</span>
            <span>× {{ item.quantity }} · <span class="font-semibold text-slate-900">¥{{ yuanExact(item.amount) }}</span></span>
          </div>
          <p class="mt-1 text-xs text-slate-400">{{ formatTime(item.created_at) }}</p>
        </RouterLink>
      </li>
    </ul>
  </div>
</template>
