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
let poller: ReturnType<typeof setInterval> | undefined;

const wechat = computed(() => shopState.shop?.contact_wechat ?? '');

const banner = computed(() => {
  switch (order.value?.status) {
    case 'pending':
      return {
        tone: 'bg-amber-50 text-amber-900 ring-amber-200',
        title: '等待客服确认收款',
        text: `付款后请添加客服微信 ${wechat.value}，发送付款截图和订单号。客服确认后，这里会显示你的卡密。`,
      };
    case 'paid':
      return { tone: 'bg-blue-50 text-blue-900 ring-blue-200', title: '已确认收款', text: '客服正在为你办理，大约 5 分钟完成。' };
    case 'completed':
      return { tone: 'bg-emerald-50 text-emerald-900 ring-emerald-200', title: '订单已完成', text: '感谢购买，有问题随时联系客服。' };
    case 'cancelled':
      return {
        tone: 'bg-slate-100 text-slate-700 ring-slate-200',
        title: '订单已取消',
        text: '超过付款时间未确认收款，订单已自动取消。如果你已经付过款，请联系客服处理。',
      };
    default:
      return null;
  }
});

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
  <div class="mx-auto max-w-2xl space-y-4">
    <section v-if="!order" class="card p-5">
      <h1 class="text-base font-semibold text-slate-900">订单 {{ orderNo }}</h1>
      <p v-if="loading" class="mt-2 text-sm text-slate-500">正在加载订单…</p>
      <template v-else>
        <p class="mt-1 text-sm text-slate-500">输入下单时填写的手机号，查看订单详情。</p>
        <div class="mt-4">
          <PhoneForm :initial="phone" submit-label="查看" :busy="loading" @submit="load" />
        </div>
        <p v-if="error" class="mt-3 text-sm text-rose-600" role="alert">{{ error }}</p>
      </template>
    </section>

    <template v-else>
      <section v-if="banner" class="rounded-2xl p-4 ring-1 ring-inset" :class="banner.tone">
        <p class="font-semibold">{{ banner.title }}</p>
        <p class="mt-1 text-sm leading-6 opacity-90">{{ banner.text }}</p>
        <RouterLink v-if="order.status === 'pending'" :to="`/pay/${order.order_no}`" class="btn-primary mt-3 h-10 text-sm">
          还没付款？去付款
        </RouterLink>
      </section>

      <section class="card p-4 sm:p-5">
        <div class="flex items-center justify-between gap-3">
          <h1 class="text-base font-semibold text-slate-900">订单信息</h1>
          <StatusBadge :status="order.status" />
        </div>
        <div class="mt-4 flex gap-3">
          <img v-if="order.product_image" :src="order.product_image" alt="" class="h-16 w-16 shrink-0 rounded-xl object-cover ring-1 ring-slate-200" />
          <div class="min-w-0 flex-1">
            <p class="line-clamp-2 text-[15px] leading-6 font-medium text-slate-900">{{ order.product_name }}</p>
            <p class="mt-1 text-sm text-slate-500">¥{{ yuanExact(order.unit_price) }} × {{ order.quantity }}</p>
          </div>
        </div>
        <dl class="mt-4 space-y-2.5 border-t border-slate-100 pt-4 text-sm">
          <div class="flex items-center justify-between gap-3">
            <dt class="text-slate-500">订单号</dt>
            <dd class="flex items-center gap-2 font-mono font-semibold text-slate-900">{{ order.order_no }} <CopyButton :text="order.order_no" /></dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="text-slate-500">订单金额</dt>
            <dd class="font-semibold text-slate-900">¥{{ yuanExact(order.amount) }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="text-slate-500">支付方式</dt>
            <dd class="text-slate-900">{{ PAY_TEXT[order.pay_method] }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="text-slate-500">下单时间</dt>
            <dd class="text-slate-900">{{ formatTime(order.created_at) }}</dd>
          </div>
          <div v-if="order.paid_at" class="flex justify-between gap-3">
            <dt class="text-slate-500">确认收款</dt>
            <dd class="text-slate-900">{{ formatTime(order.paid_at) }}</dd>
          </div>
        </dl>
      </section>

      <section v-if="order.cards.length" class="card p-4 sm:p-5">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-base font-semibold text-slate-900">您购买的卡密 {{ order.cards.length }} 张</h2>
          <CopyButton v-if="order.cards.length > 1" :text="allCards" label="全部复制" />
        </div>
        <ul class="mt-3 space-y-2">
          <li v-for="(card, index) in order.cards" :key="index" class="flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-3">
            <div class="min-w-0">
              <p class="text-xs text-slate-400">第 {{ index + 1 }} 张</p>
              <p class="mt-0.5 font-mono text-[15px] break-all whitespace-pre-wrap text-slate-900">{{ card }}</p>
            </div>
            <CopyButton :text="card" />
          </li>
        </ul>
      </section>

      <section v-if="order.instructions" class="card p-4 sm:p-5">
        <h2 class="mb-1 text-base font-semibold text-slate-900">使用说明</h2>
        <HtmlContent :html="order.instructions" />
      </section>

      <ContactCard>付款后请添加客服微信，发送「付款截图 + 订单号」；客服办理后刷新本页即可看到卡密。</ContactCard>
    </template>
  </div>
</template>
