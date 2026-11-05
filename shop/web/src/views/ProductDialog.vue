<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, type BuyerCoupon, type CouponQuote, type PayMethod, type ProductDetail } from '../api';
import HtmlContent from '../components/HtmlContent.vue';
import PriceTag from '../components/PriceTag.vue';
import StockBadge from '../components/StockBadge.vue';
import { couponText, errorMessage, normalizePhone, rememberedPhone, rememberPhone, setTitle, yuanShort } from '../format';
import { shopState } from '../shop';

/**
 * A product opened over the home page (route /p/:id, a child of home): its details and the order
 * form in one dialog. Closing goes back to the list where the buyer was.
 */
const props = defineProps<{ id: string }>();
const route = useRoute();
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
const validPhone = computed(() => normalizePhone(phone.value));
const phoneInvalid = computed(() => phoneTouched.value && phone.value.trim() !== '' && !validPhone.value);

const methods = [
  { key: 'wechat', label: '微信', dot: 'bg-wechat', ring: 'ring-wechat' },
  { key: 'alipay', label: '支付宝', dot: 'bg-alipay', ring: 'ring-alipay' },
] as const;

// ---- coupon: typed (or picked) codes are checked on their own; a valid one just lowers the total ----
const couponInput = ref('');
const coupon = ref<CouponQuote | null>(null);
const couponError = ref('');
const checkingCoupon = ref(false);
const myCoupons = ref<BuyerCoupon[]>([]);
const typedCode = computed(() => couponInput.value.trim().toUpperCase());

const usableMine = computed(() =>
  myCoupons.value.filter((c) => c.product_ids.length === 0 || c.product_ids.includes(product.value?.id ?? 0)),
);
// Worked out here so the total follows the quantity at once; the server checks it again on order.
const discount = computed(() => {
  const c = coupon.value;
  if (!c || c.code !== typedCode.value || total.value < c.min_amount) return 0;
  return c.kind === 'amount' ? Math.min(c.value, total.value) : total.value - Math.round((total.value * c.value) / 100);
});
const payable = computed(() => total.value - discount.value);

let ticket = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Checks the typed code; true when it is empty or fits. Only the newest check counts. */
async function checkCoupon(): Promise<boolean> {
  clearTimeout(timer);
  const code = typedCode.value;
  if (!product.value || !code) return true;
  const mine = ++ticket;
  checkingCoupon.value = true;
  try {
    const quote = await api.checkCoupon({
      code,
      product_id: product.value.id,
      quantity: quantity.value,
      phone: validPhone.value ?? undefined,
    });
    if (mine !== ticket) return false;
    coupon.value = quote;
    couponError.value = '';
    return true;
  } catch (e) {
    if (mine !== ticket) return false;
    coupon.value = null;
    couponError.value = errorMessage(e);
    return false;
  } finally {
    if (mine === ticket) checkingCoupon.value = false;
  }
}

function checkSoon(delay: number) {
  clearTimeout(timer);
  if (typedCode.value) timer = setTimeout(() => void checkCoupon(), delay);
}

watch(couponInput, () => {
  couponError.value = '';
  ticket++;
  checkingCoupon.value = false;
  if (!typedCode.value) coupon.value = null;
  checkSoon(500);
});
// A threshold or a phone-only coupon may stop fitting when the quantity or phone changes.
watch([quantity, validPhone], () => checkSoon(300));

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
    couponInput.value = '';
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
  if (!product.value || soldOut.value || submitting.value) return;
  phoneTouched.value = true;
  if (!validPhone.value) {
    formError.value = '请输入正确的 11 位手机号';
    return;
  }
  formError.value = '';
  submitting.value = true;
  try {
    if (typedCode.value && !(coupon.value?.code === typedCode.value && !checkingCoupon.value) && !(await checkCoupon())) {
      formError.value = '这个优惠券用不了，删掉券码就可以直接下单';
      return;
    }
    const order = await api.createOrder({
      product_id: product.value.id,
      quantity: quantity.value,
      phone: validPhone.value,
      pay_method: payMethod.value,
      coupon_code: typedCode.value || undefined,
    });
    rememberPhone(validPhone.value);
    await router.push(`/pay/${order.order_no}`);
  } catch (e) {
    formError.value = errorMessage(e);
  } finally {
    submitting.value = false;
  }
}

// ---- dialog ----
const panel = ref<HTMLElement | null>(null);

function close() {
  // Opened from the list: step back to it (keeping its category). Opened from a shared link: go home.
  const back = (window.history.state as { back?: unknown } | null)?.back;
  if (typeof back === 'string' && (back === '/' || back.startsWith('/?'))) router.back();
  else void router.replace({ path: '/', query: route.query });
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') close();
}

onMounted(() => {
  document.documentElement.style.overflow = 'hidden';
  window.addEventListener('keydown', onKey);
  panel.value?.focus({ preventScroll: true });
});
onBeforeUnmount(() => {
  document.documentElement.style.overflow = '';
  window.removeEventListener('keydown', onKey);
  clearTimeout(timer);
  if (shopState.shop) document.title = shopState.shop.shop_name;
});
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 sm:items-center sm:p-6" @click.self="close">
      <div
        ref="panel"
        role="dialog"
        aria-modal="true"
        :aria-label="product?.name ?? '商品'"
        tabindex="-1"
        class="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl outline-none sm:max-w-lg sm:rounded-3xl"
      >
        <!-- Name and price stay in view; the rest scrolls. -->
        <header class="flex items-start gap-3.5 px-5 pt-5 pb-4 sm:px-6">
          <div v-if="product" class="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-white shadow-soft" :class="{ 'opacity-50 grayscale': soldOut }">
            <img v-if="product.image" :src="product.image" :alt="product.name" class="h-full w-full object-cover" />
          </div>
          <div v-else-if="!loadError" class="h-14 w-14 shrink-0 animate-pulse rounded-2xl bg-stone-200/60" />
          <div class="min-w-0 flex-1 pt-0.5">
            <h2 v-if="product" class="text-[17px] leading-6 font-semibold text-stone-900">{{ product.name }}</h2>
            <div v-else-if="!loadError" class="h-5 w-3/4 animate-pulse rounded-full bg-stone-200/60" />
            <div v-if="product" class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <PriceTag :price="product.price" :original="product.original_price" />
              <StockBadge :status="product.stock_status" />
            </div>
          </div>
          <button
            type="button"
            class="-mt-1 -mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-stone-900"
            aria-label="关闭"
            @click="close"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" class="h-5 w-5" aria-hidden="true">
              <path d="M6 6l8 8M14 6l-8 8" stroke-linecap="round" />
            </svg>
          </button>
        </header>

        <div v-if="loadError" class="px-6 pt-4 pb-10 text-center">
          <p class="text-sm text-stone-500">{{ loadError }}</p>
          <button type="button" class="btn-secondary mt-5" @click="close">返回</button>
        </div>

        <div v-else-if="!product" class="space-y-3 px-5 pb-8 sm:px-6">
          <div class="h-28 animate-pulse rounded-2xl bg-stone-200/50" />
          <div class="h-12 animate-pulse rounded-2xl bg-stone-200/50" />
          <div class="h-12 animate-pulse rounded-2xl bg-stone-200/50" />
        </div>

        <template v-else>
          <form id="buy-form" class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6" novalidate @submit.prevent="submit">
            <p v-if="product.summary" class="text-sm leading-6 text-stone-500">{{ product.summary }}</p>
            <div v-if="product.description" class="mt-3 max-h-52 overflow-y-auto rounded-2xl bg-paper px-4 py-3">
              <HtmlContent :html="product.description" class="text-sm text-stone-700" />
            </div>

            <div class="mt-5 space-y-5">
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
                <label for="buy-phone" class="label">手机号</label>
                <input
                  id="buy-phone"
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
                <label for="buy-coupon" class="label">优惠券 <span class="text-stone-400">选填</span></label>
                <div class="relative">
                  <input
                    id="buy-coupon"
                    v-model="couponInput"
                    class="input bg-stone-50 pr-28 font-mono uppercase placeholder:font-sans placeholder:normal-case focus:bg-white"
                    maxlength="40"
                    autocomplete="off"
                    autocapitalize="characters"
                    spellcheck="false"
                    placeholder="有券码就填，没有不用填"
                    @blur="checkCoupon"
                  />
                  <span class="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm">
                    <span v-if="discount" class="font-medium text-accent">已减 ¥{{ yuanShort(discount) }}</span>
                    <span v-else-if="checkingCoupon" class="text-stone-400">验证中…</span>
                  </span>
                </div>
                <p v-if="couponError" class="mt-1.5 text-xs text-rose-600" role="alert">{{ couponError }}</p>
                <div v-else-if="usableMine.length && !typedCode" class="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span class="text-stone-400">你有可用的券</span>
                  <button
                    v-for="c in usableMine"
                    :key="c.code"
                    type="button"
                    class="rounded-full bg-accent/10 px-2.5 py-1 font-medium text-accent transition hover:bg-accent/15"
                    @click="couponInput = c.code"
                  >{{ couponText(c) }}</button>
                </div>
              </div>

              <p v-if="formError" class="rounded-2xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700" role="alert">{{ formError }}</p>
            </div>
          </form>

          <footer class="flex items-center gap-3 border-t border-stone-100 px-5 pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-4">
            <div class="min-w-0 flex-1">
              <p class="text-xs text-stone-400">应付</p>
              <p class="text-2xl font-semibold tracking-tight text-stone-900 tabular-nums">
                <span class="mr-0.5 text-base font-medium">¥</span>{{ yuanShort(payable) }}
                <span v-if="discount" class="ml-1 text-sm font-normal text-stone-400 line-through">¥{{ yuanShort(total) }}</span>
              </p>
            </div>
            <button type="button" class="btn-secondary hidden h-12 px-5 sm:inline-flex" @click="close">取消</button>
            <button type="submit" form="buy-form" class="btn-primary h-12 px-8 text-base" :disabled="soldOut || submitting">
              {{ soldOut ? '已售罄' : submitting ? '正在下单…' : '去付款' }}
            </button>
          </footer>
        </template>
      </div>
    </div>
  </Teleport>
</template>
