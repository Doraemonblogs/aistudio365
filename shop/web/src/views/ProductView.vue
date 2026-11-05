<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api, type BuyerCoupon, type CouponQuote, type PayMethod, type ProductDetail } from '../api';
import HtmlContent from '../components/HtmlContent.vue';
import PriceTag from '../components/PriceTag.vue';
import StockBadge from '../components/StockBadge.vue';
import {
  couponCondition,
  couponDates,
  couponText,
  errorMessage,
  normalizePhone,
  rememberedPhone,
  rememberPhone,
  setTitle,
  yuanShort,
} from '../format';
import { shopState } from '../shop';

const props = defineProps<{ id: string }>();
const router = useRouter();

const product = ref<ProductDetail | null>(null);
const loadError = ref('');

const quantity = ref(1);
const phone = ref(rememberedPhone());
const payMethod = ref<PayMethod>('wechat');
const submitting = ref(false);
const formError = ref('');
const phoneTouched = ref(false);

const soldOut = computed(() => !product.value || product.value.stock_status === 'out' || product.value.max_qty < 1);
const total = computed(() => (product.value ? product.value.price * quantity.value : 0));
const phoneInvalid = computed(() => phoneTouched.value && phone.value.trim() !== '' && !normalizePhone(phone.value));

const methods = [
  { key: 'wechat', label: '微信', dot: 'bg-wechat', ring: 'ring-wechat' },
  { key: 'alipay', label: '支付宝', dot: 'bg-alipay', ring: 'ring-alipay' },
] as const;

// ---- coupon ----
const coupon = ref<CouponQuote | null>(null);
const couponOpen = ref(false);
const couponInput = ref('');
const couponError = ref('');
const checkingCoupon = ref(false);
const myCoupons = ref<BuyerCoupon[]>([]);
const validPhone = computed(() => normalizePhone(phone.value));

/** Coupons given to this phone that fit this product, other than the one in use. */
const usableMine = computed(() =>
  myCoupons.value.filter(
    (c) => c.code !== coupon.value?.code && (c.product_ids.length === 0 || c.product_ids.includes(product.value?.id ?? 0)),
  ),
);
// Worked out here so the total follows the quantity at once; the server checks it again on order.
const discount = computed(() => {
  const c = coupon.value;
  if (!c || total.value < c.min_amount) return 0;
  return c.kind === 'amount' ? Math.min(c.value, total.value) : total.value - Math.round((total.value * c.value) / 100);
});
const payable = computed(() => total.value - discount.value);

async function applyCoupon(code = couponInput.value, quiet = false) {
  if (!product.value) return;
  if (!code.trim()) {
    couponError.value = '请输入券码';
    return;
  }
  checkingCoupon.value = true;
  couponError.value = '';
  try {
    coupon.value = await api.checkCoupon({
      code: code.trim(),
      product_id: product.value.id,
      quantity: quantity.value,
      phone: validPhone.value ?? undefined,
    });
    couponInput.value = '';
    couponOpen.value = false;
  } catch (e) {
    if (quiet) coupon.value = null;
    couponError.value = errorMessage(e);
  } finally {
    checkingCoupon.value = false;
  }
}

function removeCoupon() {
  coupon.value = null;
  couponError.value = '';
}

// A threshold or a phone-only coupon may stop fitting when the quantity or phone changes.
let recheck: ReturnType<typeof setTimeout> | undefined;
watch([quantity, validPhone], () => {
  clearTimeout(recheck);
  if (coupon.value) recheck = setTimeout(() => void applyCoupon(coupon.value!.code, true), 400);
});

watch(
  validPhone,
  async (p) => {
    myCoupons.value = p ? await api.myCoupons(p).catch(() => []) : [];
  },
  { immediate: true },
);

watch(
  () => props.id,
  async (id) => {
    product.value = null;
    loadError.value = '';
    quantity.value = 1;
    removeCoupon();
    try {
      product.value = await api.product(Number(id));
      setTitle(product.value.name, shopState.shop?.shop_name);
    } catch (e) {
      loadError.value = errorMessage(e);
    }
  },
  { immediate: true },
);

function changeQuantity(delta: number) {
  if (!product.value) return;
  quantity.value = Math.min(product.value.max_qty, Math.max(1, quantity.value + delta));
}

async function submit() {
  if (!product.value || soldOut.value) return;
  phoneTouched.value = true;
  const normalized = normalizePhone(phone.value);
  if (!normalized) {
    formError.value = '请输入正确的 11 位手机号';
    return;
  }
  formError.value = '';
  submitting.value = true;
  try {
    const order = await api.createOrder({
      product_id: product.value.id,
      quantity: quantity.value,
      phone: normalized,
      pay_method: payMethod.value,
      coupon_code: coupon.value?.code,
    });
    rememberPhone(normalized);
    await router.push(`/pay/${order.order_no}`);
  } catch (e) {
    formError.value = errorMessage(e);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div>
    <RouterLink to="/" class="-ml-2 mb-4 inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-stone-500 transition hover:text-stone-900">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4" aria-hidden="true">
        <path d="M12 5l-5 5 5 5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      全部商品
    </RouterLink>

    <div v-if="loadError" class="py-20 text-center">
      <p class="text-stone-500">{{ loadError }}</p>
      <RouterLink to="/" class="btn-secondary mt-5">返回首页</RouterLink>
    </div>

    <div v-else-if="!product" class="grid gap-8 md:grid-cols-[minmax(0,1fr)_340px] md:gap-12 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div class="flex items-center gap-4 sm:gap-5">
        <div class="h-20 w-20 shrink-0 animate-pulse rounded-[22px] bg-stone-200/60 sm:h-28 sm:w-28 sm:rounded-[28px]" />
        <div class="flex-1 space-y-3">
          <div class="h-7 w-4/5 animate-pulse rounded-full bg-stone-200/60" />
          <div class="h-8 w-1/3 animate-pulse rounded-full bg-stone-200/60" />
        </div>
      </div>
      <div class="h-80 animate-pulse rounded-3xl bg-stone-200/60" />
    </div>

    <!--
      Product pictures are app icons, so they sit small beside the name, the way an app store lists them.
      Wide screens: name and details on the left, the buy card held on the right while the details scroll.
      Narrow screens: name, buy card, then details.
    -->
    <div v-else class="grid gap-y-10 md:grid-cols-[minmax(0,1fr)_340px] md:grid-rows-[auto_1fr] md:gap-x-12 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-x-16">
      <header class="md:col-start-1 md:row-start-1">
        <div class="flex items-center gap-4 sm:gap-5">
          <div
            class="h-20 w-20 shrink-0 overflow-hidden rounded-[22px] bg-white shadow-soft sm:h-28 sm:w-28 sm:rounded-[28px]"
            :class="{ 'opacity-50 grayscale': soldOut }"
          >
            <img v-if="product.image" :src="product.image" :alt="product.name" class="h-full w-full object-cover" />
            <span v-else class="flex h-full w-full items-center justify-center bg-sand text-3xl font-semibold text-stone-400" aria-hidden="true">
              {{ product.name.replace(/^【[^】]*】/, '').trim().charAt(0) }}
            </span>
          </div>
          <div class="min-w-0 flex-1">
            <h1 class="text-lg leading-7 font-semibold tracking-tight text-stone-900 sm:text-[22px] sm:leading-8">{{ product.name }}</h1>
            <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 sm:mt-3">
              <PriceTag :price="product.price" :original="product.original_price" large />
              <StockBadge :status="product.stock_status" />
            </div>
          </div>
        </div>
        <p v-if="product.summary" class="mt-5 text-[15px] leading-7 text-stone-500 sm:mt-6">{{ product.summary }}</p>
      </header>

      <div class="md:col-start-2 md:row-span-2 md:row-start-1">
        <form class="card space-y-6 p-5 sm:p-6 md:sticky md:top-24" novalidate @submit.prevent="submit">
          <div class="flex items-center justify-between gap-3">
            <span class="text-sm text-stone-500">数量</span>
            <div class="flex items-center gap-3">
              <span v-if="!soldOut" class="text-xs text-stone-400">最多 {{ product.max_qty }} 件</span>
              <div class="inline-flex items-center rounded-full bg-stone-100 p-1">
                <button
                  type="button"
                  class="flex h-8 w-8 items-center justify-center rounded-full text-lg text-stone-600 transition hover:bg-white disabled:text-stone-300 disabled:hover:bg-transparent"
                  :disabled="soldOut || quantity <= 1"
                  aria-label="减少"
                  @click="changeQuantity(-1)"
                >−</button>
                <span class="w-9 text-center font-semibold text-stone-900 tabular-nums">{{ quantity }}</span>
                <button
                  type="button"
                  class="flex h-8 w-8 items-center justify-center rounded-full text-lg text-stone-600 transition hover:bg-white disabled:text-stone-300 disabled:hover:bg-transparent"
                  :disabled="soldOut || quantity >= product.max_qty"
                  aria-label="增加"
                  @click="changeQuantity(1)"
                >+</button>
              </div>
            </div>
          </div>

          <div>
            <label for="phone" class="label">手机号</label>
            <input
              id="phone"
              v-model="phone"
              type="tel"
              inputmode="numeric"
              autocomplete="tel"
              maxlength="16"
              placeholder="用来查订单，不会公开"
              class="input bg-stone-50 focus:bg-white"
              :class="{ 'border-rose-300 focus:border-rose-400 focus:ring-rose-100': phoneInvalid }"
              @blur="phoneTouched = true"
            />
            <p v-if="phoneInvalid" class="mt-1.5 text-xs text-rose-600">请输入正确的 11 位手机号</p>
          </div>

          <div>
            <span class="label">付款方式</span>
            <div class="grid grid-cols-2 gap-3" role="radiogroup" aria-label="付款方式">
              <button
                v-for="method in methods"
                :key="method.key"
                type="button"
                role="radio"
                :aria-checked="payMethod === method.key"
                class="flex h-12 items-center justify-center gap-2 rounded-2xl text-[15px] transition"
                :class="payMethod === method.key ? `bg-white font-semibold text-stone-900 ring-2 ${method.ring}` : 'bg-stone-100 text-stone-500 hover:text-stone-800'"
                @click="payMethod = method.key"
              >
                <span class="h-2.5 w-2.5 rounded-full" :class="method.dot" aria-hidden="true" />
                {{ method.label }}
              </button>
            </div>
          </div>

          <div v-if="!soldOut">
            <div class="flex items-center justify-between gap-3">
              <span class="text-sm text-stone-500">优惠券</span>
              <button
                v-if="!coupon && !couponOpen"
                type="button"
                class="text-sm text-stone-500 transition hover:text-stone-900"
                @click="couponOpen = true"
              >
                <span v-if="usableMine.length" class="font-medium text-accent">你有 {{ usableMine.length }} 张可用 · </span>输入券码
              </button>
            </div>

            <div v-if="coupon" class="mt-2.5 flex items-center gap-3 rounded-2xl bg-accent/5 px-4 py-3 ring-1 ring-accent/20 ring-inset">
              <div class="min-w-0 flex-1">
                <p class="text-[15px] font-semibold text-accent">
                  {{ couponText(coupon) }}<span v-if="discount" class="ml-2 text-sm font-medium">省 ¥{{ yuanShort(discount) }}</span>
                </p>
                <p class="mt-0.5 truncate text-xs text-stone-500">
                  <span class="font-mono">{{ coupon.code }}</span> · {{ couponCondition(coupon) }} · {{ couponDates(coupon) }}
                </p>
              </div>
              <button type="button" class="shrink-0 text-sm text-stone-500 hover:text-stone-900" @click="removeCoupon">不用了</button>
            </div>

            <ul v-else-if="usableMine.length" class="mt-2.5 space-y-2">
              <li v-for="c in usableMine" :key="c.code">
                <button
                  type="button"
                  class="flex w-full items-center gap-3 rounded-2xl bg-stone-50 px-4 py-3 text-left transition hover:bg-accent/5"
                  :disabled="checkingCoupon"
                  @click="applyCoupon(c.code)"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block text-[15px] font-semibold text-stone-900">{{ couponText(c) }}</span>
                    <span class="mt-0.5 block truncate text-xs text-stone-500">{{ c.name || '优惠券' }} · {{ couponCondition(c) }} · {{ couponDates(c) }}</span>
                  </span>
                  <span class="shrink-0 text-sm font-medium text-accent">使用</span>
                </button>
              </li>
            </ul>

            <div v-if="couponOpen && !coupon" class="mt-2.5 flex gap-2">
              <input
                v-model="couponInput"
                class="input h-11 bg-stone-50 font-mono uppercase placeholder:font-sans placeholder:normal-case focus:bg-white"
                maxlength="40"
                autocomplete="off"
                placeholder="输入券码"
                aria-label="券码"
                @keydown.enter.prevent="applyCoupon()"
              />
              <button type="button" class="btn-secondary h-11 shrink-0 px-5" :disabled="checkingCoupon" @click="applyCoupon()">
                {{ checkingCoupon ? '…' : '使用' }}
              </button>
            </div>
            <p v-if="couponError" class="mt-1.5 text-xs text-rose-600" role="alert">{{ couponError }}</p>
          </div>

          <p v-if="formError" class="rounded-2xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700" role="alert">{{ formError }}</p>

          <div class="flex items-center gap-4 pt-1">
            <div class="min-w-0 flex-1">
              <p class="text-xs text-stone-400">应付</p>
              <p class="text-2xl font-semibold tracking-tight text-stone-900 tabular-nums">
                <span class="mr-0.5 text-base font-medium">¥</span>{{ yuanShort(payable) }}
                <span v-if="discount" class="ml-1 text-sm font-normal text-stone-400 line-through">¥{{ yuanShort(total) }}</span>
              </p>
            </div>
            <button type="submit" class="btn-primary h-12 flex-1 text-base" :disabled="soldOut || submitting">
              {{ soldOut ? '已售罄' : submitting ? '正在下单…' : '去付款' }}
            </button>
          </div>
        </form>
      </div>

      <section v-if="product.description" class="md:col-start-1 md:row-start-2">
        <h2 class="mb-3 flex items-center gap-2 text-xs font-medium tracking-[0.2em] text-stone-500">
          <span class="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />商品详情
        </h2>
        <HtmlContent :html="product.description" class="text-stone-700" />
      </section>
    </div>
  </div>
</template>
