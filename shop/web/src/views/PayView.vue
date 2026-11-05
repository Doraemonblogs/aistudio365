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
  <div class="mx-auto max-w-md space-y-4">
    <section v-if="!order" class="card p-5">
      <h1 class="text-base font-semibold text-slate-900">订单 {{ orderNo }}</h1>
      <p v-if="loading" class="mt-2 text-sm text-slate-500">正在加载订单…</p>
      <template v-else>
        <p class="mt-1 text-sm text-slate-500">输入下单时填写的手机号，查看付款方式。</p>
        <div class="mt-4">
          <PhoneForm :initial="phone" submit-label="查看" :busy="loading" @submit="load" />
        </div>
        <p v-if="error" class="mt-3 text-sm text-rose-600" role="alert">{{ error }}</p>
      </template>
    </section>

    <template v-else>
      <section class="card p-5 text-center">
        <p class="text-sm text-slate-500">
          应付金额 ·
          <span :class="order.pay_method === 'wechat' ? 'text-wechat' : 'text-alipay'" class="font-semibold">{{ methodText }}扫码</span>
        </p>
        <p class="mt-1 text-4xl font-bold tracking-tight text-slate-900 tabular-nums">
          <span class="mr-0.5 text-2xl">¥</span>{{ yuanExact(order.amount) }}
        </p>
        <p class="mt-2 text-sm text-slate-500">{{ order.product_name }} × {{ order.quantity }}</p>
        <div class="mt-4 flex items-center justify-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
          <span class="text-sm text-slate-500">订单号</span>
          <span class="font-mono text-[15px] font-semibold tracking-wide text-slate-900">{{ order.order_no }}</span>
          <CopyButton :text="order.order_no" />
        </div>
        <p class="mt-3 text-xs text-slate-500">
          请在 <span class="font-semibold text-amber-600 tabular-nums">{{ countdown }}</span> 内付款并点「我已付款」，超时订单会自动取消
        </p>
      </section>

      <section class="card p-5 text-center">
        <template v-if="order.qr?.url">
          <img :src="order.qr.url" :alt="`${methodText}收款码`" class="mx-auto w-full max-w-[260px] rounded-xl ring-1 ring-slate-200" />
          <p
            class="mt-4 rounded-xl px-3 py-2 text-sm font-medium"
            :class="order.qr.fixed_amount ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'"
          >
            <template v-if="order.qr.fixed_amount">这是固定金额的收款码，扫码后直接付款即可</template>
            <template v-else>付款时请输入金额 ¥{{ yuanExact(order.amount) }}，金额必须一致</template>
          </p>
          <p class="mt-2 text-xs leading-5 text-slate-500">
            用手机下单的话：长按或截图保存收款码，再到{{ methodText }}「扫一扫」里从相册选择
          </p>
        </template>
        <p v-else class="text-sm text-slate-600">收款码暂未设置，请直接联系客服微信付款。</p>
      </section>

      <section class="card p-5">
        <h2 class="text-base font-semibold text-slate-900">付款后请这样做</h2>
        <ol class="mt-3 space-y-3 text-sm leading-6 text-slate-700">
          <li class="flex gap-3">
            <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-600">1</span>
            <span>用{{ methodText }}扫码付款 ¥{{ yuanExact(order.amount) }}，付款备注可以填订单号</span>
          </li>
          <li class="flex gap-3">
            <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-600">2</span>
            <span>截图付款成功页面，再点下方「我已付款」，马上就能看到卡密</span>
          </li>
          <li class="flex gap-3">
            <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-600">3</span>
            <span class="flex flex-1 flex-wrap items-center justify-between gap-2">
              <span>需要客服办理的，添加客服微信 <span class="font-semibold text-slate-900">{{ wechat }}</span>，发送「截图 + 订单号」</span>
              <CopyButton v-if="wechat" :text="wechat" label="复制微信号" />
            </span>
          </li>
        </ol>
      </section>

      <div class="grid gap-3">
        <button type="button" class="btn-primary h-12 text-base" :disabled="paying" @click="markPaid">
          {{ paying ? '正在提交…' : '我已付款，查看卡密' }}
        </button>
        <p v-if="payError" class="text-center text-sm text-rose-600" role="alert">{{ payError }}</p>
        <RouterLink to="/" class="btn-secondary">返回首页</RouterLink>
      </div>
    </template>
  </div>
</template>
