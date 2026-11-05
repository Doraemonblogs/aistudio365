<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ApiError, api, type BuyerOrder } from '../api';
import ContactCard from '../components/ContactCard.vue';
import CopyButton from '../components/CopyButton.vue';
import HtmlContent from '../components/HtmlContent.vue';
import PhoneForm from '../components/PhoneForm.vue';
import StatusBadge from '../components/StatusBadge.vue';
import { errorMessage, formatTime, PAY_TEXT, rememberedPhone, rememberPhone, setTitle, yuanExact } from '../format';
import { shopState } from '../shop';

const props = defineProps<{ orderNo: string }>();

const phone = ref(rememberedPhone());
const order = ref<BuyerOrder | null>(null);
const error = ref('');
const loading = ref(false);
const paying = ref(false);
const payError = ref('');
let poller: ReturnType<typeof setInterval> | undefined;

const wechat = computed(() => shopState.shop?.contact_wechat ?? '');

const ICON = {
  clock: 'M10 6.5V10l2.5 1.5M16.5 10a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z',
  check: 'M5.5 10.5l3 3 6-7',
  cross: 'M7 7l6 6M13 7l-6 6',
};

const banner = computed(() => {
  switch (order.value?.status) {
    case 'pending':
      return {
        tone: 'bg-amber-50 text-amber-950',
        badge: 'bg-amber-100 text-amber-700',
        icon: ICON.clock,
        title: '等待付款',
        text: '付款成功后点「我已付款」，卡密会马上显示在下面。',
      };
    case 'paid':
      return {
        tone: 'bg-sky-50 text-sky-950',
        badge: 'bg-sky-100 text-sky-700',
        icon: ICON.check,
        title: '已付款',
        text: `卡密已发放，看看下面的卡密和使用说明。需要客服办理的，请加微信 ${wechat.value}，发送付款截图。`,
      };
    case 'completed':
      return {
        tone: 'bg-emerald-50 text-emerald-950',
        badge: 'bg-emerald-100 text-emerald-700',
        icon: ICON.check,
        title: '订单已完成',
        text: '感谢购买，有问题随时联系客服。',
      };
    case 'cancelled':
      return {
        tone: 'bg-stone-200/50 text-stone-800',
        badge: 'bg-stone-200 text-stone-500',
        icon: ICON.cross,
        title: '订单已取消',
        text: '订单超过付款时间，或客服没有收到这笔款项，已取消。如果你已经付过款，请联系客服处理。',
      };
    default:
      return null;
  }
});

// The buyer's word is taken: the order turns paid and the cards show at once.
async function markPaid() {
  if (!order.value || paying.value) return;
  paying.value = true;
  payError.value = '';
  try {
    order.value = await api.markPaid(order.value.order_no, phone.value);
  } catch (e) {
    payError.value = errorMessage(e);
  } finally {
    paying.value = false;
  }
}

async function load(withPhone = phone.value, quiet = false) {
  if (!withPhone) return;
  if (!quiet) loading.value = true;
  try {
    order.value = await api.order(props.orderNo, withPhone);
    error.value = '';
    phone.value = withPhone;
    rememberPhone(withPhone);
    setTitle(`订单 ${order.value.order_no}`, shopState.shop?.shop_name);
  } catch (e) {
    if (!quiet) error.value = e instanceof ApiError && e.status === 404 ? '没有找到这个订单，请确认手机号是否正确' : errorMessage(e);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
  // Keep a waiting buyer's page current while customer service confirms the payment.
  poller = setInterval(() => {
    if (document.visibilityState === 'visible' && (order.value?.status === 'pending' || order.value?.status === 'paid')) {
      void load(phone.value, true);
    }
  }, 15_000);
});
onBeforeUnmount(() => clearInterval(poller));

const allCards = computed(() => order.value?.cards.join('\n') ?? '');
</script>

<template>
  <div class="mx-auto max-w-xl space-y-6">
    <section v-if="!order" class="card p-6">
      <h1 class="text-lg font-semibold text-stone-900">订单 {{ orderNo }}</h1>
      <p v-if="loading" class="mt-2 text-sm text-stone-500">正在加载订单…</p>
      <template v-else>
        <p class="mt-1 text-sm text-stone-500">输入下单时填写的手机号，查看订单详情。</p>
        <div class="mt-5">
          <PhoneForm :initial="phone" submit-label="查看" :busy="loading" @submit="load" />
        </div>
        <p v-if="error" class="mt-3 text-sm text-rose-600" role="alert">{{ error }}</p>
      </template>
    </section>

    <template v-else>
      <section v-if="banner" class="rounded-3xl px-5 py-5 sm:px-6" :class="banner.tone">
        <div class="flex items-start gap-3.5">
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" :class="banner.badge">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" class="h-5 w-5" aria-hidden="true">
              <path :d="banner.icon" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <div class="min-w-0 flex-1">
            <h1 class="text-[17px] leading-9 font-semibold">{{ banner.title }}</h1>
            <p class="text-sm leading-6 opacity-75">{{ banner.text }}</p>
          </div>
        </div>
        <div v-if="order.status === 'pending'" class="mt-4 flex flex-wrap gap-2 sm:pl-12">
          <button type="button" class="btn-primary h-10 px-5 text-sm" :disabled="paying" @click="markPaid">
            {{ paying ? '正在提交…' : '我已付款，查看卡密' }}
          </button>
          <RouterLink :to="`/pay/${order.order_no}`" class="btn-secondary h-10 px-5 text-sm">还没付款？去付款</RouterLink>
        </div>
        <p v-if="payError" class="mt-3 text-sm text-rose-600 sm:pl-12" role="alert">{{ payError }}</p>
      </section>

      <!-- One surface for what was bought and what it unlocks. -->
      <section class="card p-5 sm:p-6">
        <div class="flex items-center gap-4">
          <img v-if="order.product_image" :src="order.product_image" alt="" class="h-14 w-14 shrink-0 rounded-2xl object-cover" />
          <div class="min-w-0 flex-1">
            <p class="line-clamp-2 text-[15px] leading-6 font-medium text-stone-900">{{ order.product_name }}</p>
            <p class="mt-0.5 text-sm text-stone-500">¥{{ yuanExact(order.unit_price) }} × {{ order.quantity }}</p>
          </div>
          <StatusBadge :status="order.status" />
        </div>

        <div v-if="order.cards.length" class="mt-6">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-sm font-semibold text-stone-900">你的卡密 · {{ order.cards.length }} 张</h2>
            <CopyButton v-if="order.cards.length > 1" :text="allCards" label="全部复制" />
          </div>
          <ul class="mt-3 space-y-2">
            <li v-for="(card, index) in order.cards" :key="index" class="flex items-center justify-between gap-3 rounded-2xl bg-stone-50 px-4 py-3">
              <p class="min-w-0 font-mono text-[15px] break-all whitespace-pre-wrap text-stone-900">
                <span v-if="order.cards.length > 1" class="mr-2 text-xs text-stone-400">{{ index + 1 }}</span>{{ card }}
              </p>
              <CopyButton :text="card" />
            </li>
          </ul>
        </div>

        <div v-if="order.instructions" class="mt-6">
          <h2 class="text-sm font-semibold text-stone-900">使用说明</h2>
          <HtmlContent :html="order.instructions" class="mt-1.5 text-stone-600" />
        </div>
      </section>

      <dl class="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 px-1 text-sm">
        <dt class="text-stone-400">订单号</dt>
        <dd class="flex items-center justify-end gap-2 font-mono font-medium text-stone-800">{{ order.order_no }} <CopyButton :text="order.order_no" /></dd>
        <dt class="text-stone-400">订单金额</dt>
        <dd class="text-right font-semibold text-stone-900">¥{{ yuanExact(order.amount) }}</dd>
        <dt class="text-stone-400">付款方式</dt>
        <dd class="text-right text-stone-700">{{ PAY_TEXT[order.pay_method] }}</dd>
        <dt class="text-stone-400">下单时间</dt>
        <dd class="text-right text-stone-700 tabular-nums">{{ formatTime(order.created_at) }}</dd>
        <template v-if="order.paid_at">
          <dt class="text-stone-400">付款时间</dt>
          <dd class="text-right text-stone-700 tabular-nums">{{ formatTime(order.paid_at) }}</dd>
        </template>
      </dl>

      <ContactCard>需要客服办理或遇到问题，加客服微信，发送付款截图。</ContactCard>
    </template>
  </div>
</template>
