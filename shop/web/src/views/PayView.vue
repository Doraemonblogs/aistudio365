<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ApiError, api, type BuyerOrder } from '../api';
import CopyButton from '../components/CopyButton.vue';
import PhoneForm from '../components/PhoneForm.vue';
import { errorMessage, PAY_TEXT, rememberedPhone, rememberPhone, setTitle, yuanExact } from '../format';
import { shopState } from '../shop';

const props = defineProps<{ orderNo: string }>();
const router = useRouter();

const phone = ref(rememberedPhone());
const order = ref<BuyerOrder | null>(null);
const error = ref('');
const loading = ref(false);
const paying = ref(false);
const payError = ref('');
const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | undefined;

const wechat = computed(() => shopState.shop?.contact_wechat ?? '');
const methodText = computed(() => (order.value ? PAY_TEXT[order.value.pay_method] : ''));
const remaining = computed(() => (order.value ? Date.parse(order.value.expire_at) - now.value : 0));
const countdown = computed(() => {
  const seconds = Math.max(0, Math.floor(remaining.value / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
});

async function load(withPhone = phone.value) {
  if (!withPhone) return;
  loading.value = true;
  error.value = '';
  try {
    const result = await api.order(props.orderNo, withPhone);
    phone.value = withPhone;
    rememberPhone(withPhone);
    if (result.status !== 'pending') {
      await router.replace(`/order/${result.order_no}`);
      return;
    }
    order.value = result;
    setTitle('扫码付款', shopState.shop?.shop_name);
  } catch (e) {
    error.value = e instanceof ApiError && e.status === 404 ? '没有找到这个订单，请确认手机号是否正确' : errorMessage(e);
  } finally {
    loading.value = false;
  }
}

// The buyer's word is taken: the order turns paid and its page shows the cards.
async function markPaid() {
  if (!order.value || paying.value) return;
  paying.value = true;
  payError.value = '';
  try {
    const result = await api.markPaid(order.value.order_no, phone.value);
    await router.push(`/order/${result.order_no}`);
  } catch (e) {
    payError.value = errorMessage(e);
  } finally {
    paying.value = false;
  }
}

onMounted(() => {
  void load();
  ticker = setInterval(() => {
    now.value = Date.now();
    // Past the deadline: reload so the page moves on to the cancelled order.
    if (order.value && remaining.value <= 0) {
      order.value = null;
      void load();
    }
  }, 1000);
});
onBeforeUnmount(() => clearInterval(ticker));
</script>

<template>
  <div class="mx-auto max-w-md">
    <section v-if="!order" class="card p-6">
      <h1 class="text-lg font-semibold text-stone-900">订单 {{ orderNo }}</h1>
      <p v-if="loading" class="mt-2 text-sm text-stone-500">正在加载订单…</p>
      <template v-else>
        <p class="mt-1 text-sm text-stone-500">输入下单时填写的手机号，查看付款方式。</p>
        <div class="mt-5">
          <PhoneForm :initial="phone" submit-label="查看" :busy="loading" @submit="load" />
        </div>
        <p v-if="error" class="mt-3 text-sm text-rose-600" role="alert">{{ error }}</p>
      </template>
    </section>

    <template v-else>
      <!-- The amount sits on the page itself; only the QR code gets a surface. -->
      <div class="pt-2 text-center">
        <p class="line-clamp-1 text-sm text-stone-500">{{ order.product_name }} × {{ order.quantity }}</p>
        <p class="mt-3 text-[44px] leading-none font-semibold tracking-tight text-stone-900 tabular-nums">
          <span class="mr-1 text-2xl font-medium">¥</span>{{ yuanExact(order.amount) }}
        </p>
        <p class="mt-5 inline-flex items-center gap-2 rounded-full bg-white py-1 pr-1 pl-4 text-sm text-stone-500 shadow-soft">
          订单号
          <span class="font-mono font-semibold tracking-wide text-stone-900">{{ order.order_no }}</span>
          <CopyButton :text="order.order_no" />
        </p>
      </div>

      <section v-if="order.amount === 0" class="card mt-7 px-6 py-7 text-center">
        <p class="text-[15px] font-medium text-stone-900">优惠券已全额抵扣，这单不用付款</p>
        <p class="mt-1.5 text-sm text-stone-500">直接点下面的「我已付款，查看卡密」就能领取。</p>
      </section>

      <section v-else class="card mt-7 px-6 pt-6 pb-5 text-center">
        <p class="inline-flex items-center gap-2 text-sm font-medium" :class="order.pay_method === 'wechat' ? 'text-wechat' : 'text-alipay'">
          <span class="h-2 w-2 rounded-full" :class="order.pay_method === 'wechat' ? 'bg-wechat' : 'bg-alipay'" aria-hidden="true" />
          {{ methodText }}扫码付款
        </p>
        <template v-if="order.qr?.url">
          <img :src="order.qr.url" :alt="`${methodText}收款码`" class="mx-auto mt-4 w-full max-w-[240px] rounded-2xl" />
          <p class="mt-5 text-sm font-medium" :class="order.qr.fixed_amount ? 'text-emerald-700' : 'text-amber-700'">
            <template v-if="order.qr.fixed_amount">固定金额收款码，扫码直接付款即可</template>
            <template v-else>付款时请输入 ¥{{ yuanExact(order.amount) }}，金额要一致</template>
          </p>
          <p class="mt-1.5 text-xs leading-5 text-stone-400">在手机上：长按或截图保存收款码，再到{{ methodText }}「扫一扫」里从相册选择</p>
        </template>
        <p v-else class="mt-4 text-sm text-stone-600">收款码暂未设置，请直接联系客服微信付款。</p>
        <p class="mt-5 rounded-full bg-stone-100 px-4 py-2 text-xs text-stone-500">
          请在 <span class="font-semibold text-stone-800 tabular-nums">{{ countdown }}</span> 内付款，超时订单会自动取消
        </p>
      </section>

      <section v-if="order.amount > 0" class="mt-8 px-1">
        <h2 class="text-[15px] font-semibold text-stone-900">付款之后</h2>
        <ol class="mt-3 space-y-3 text-sm leading-6 text-stone-600">
          <li class="flex gap-3">
            <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stone-900 text-[11px] font-semibold text-white">1</span>
            <span>截图付款成功的页面</span>
          </li>
          <li class="flex gap-3">
            <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stone-900 text-[11px] font-semibold text-white">2</span>
            <span>点下方「我已付款」，马上就能看到卡密</span>
          </li>
          <li class="flex gap-3">
            <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stone-900 text-[11px] font-semibold text-white">3</span>
            <span class="flex flex-1 flex-wrap items-center justify-between gap-2">
              <span>需要客服办理的，加微信 <span class="font-semibold text-stone-900">{{ wechat }}</span>，发送付款截图</span>
              <CopyButton v-if="wechat" :text="wechat" label="复制微信号" />
            </span>
          </li>
        </ol>
      </section>

      <div class="mt-8 grid gap-3">
        <button type="button" class="btn-primary h-12 text-base" :disabled="paying" @click="markPaid">
          {{ paying ? '正在提交…' : '我已付款，查看卡密' }}
        </button>
        <p v-if="payError" class="text-center text-sm text-rose-600" role="alert">{{ payError }}</p>
        <RouterLink to="/" class="btn-secondary">返回首页</RouterLink>
      </div>
    </template>
  </div>
</template>
