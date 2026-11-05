<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api, type PayMethod, type ProductDetail } from '../api';
import HtmlContent from '../components/HtmlContent.vue';
import PriceTag from '../components/PriceTag.vue';
import StockBadge from '../components/StockBadge.vue';
import { errorMessage, normalizePhone, rememberedPhone, rememberPhone, setTitle, yuanShort } from '../format';
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

watch(
  () => props.id,
  async (id) => {
    product.value = null;
    loadError.value = '';
    quantity.value = 1;
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

    <div v-else-if="!product" class="grid gap-8 md:grid-cols-2 md:gap-12">
      <div class="aspect-square animate-pulse rounded-3xl bg-stone-200/60" />
      <div class="space-y-4">
        <div class="h-7 w-4/5 animate-pulse rounded-full bg-stone-200/60" />
        <div class="h-9 w-1/3 animate-pulse rounded-full bg-stone-200/60" />
        <div class="h-72 animate-pulse rounded-3xl bg-stone-200/60" />
      </div>
    </div>

    <template v-else>
      <div class="grid gap-8 md:grid-cols-2 md:items-start md:gap-12">
        <div class="overflow-hidden rounded-3xl bg-white shadow-soft md:sticky md:top-24">
          <img
            v-if="product.image"
            :src="product.image"
            :alt="product.name"
            class="aspect-square w-full object-cover"
            :class="{ 'opacity-50 grayscale': soldOut }"
          />
        </div>

        <div>
          <h1 class="text-xl leading-8 font-semibold tracking-tight text-stone-900 sm:text-2xl sm:leading-9">{{ product.name }}</h1>
          <div class="mt-4 flex items-end justify-between gap-3">
            <PriceTag :price="product.price" :original="product.original_price" large />
            <StockBadge :status="product.stock_status" />
          </div>
          <p v-if="product.summary" class="mt-4 text-[15px] leading-7 text-stone-500">{{ product.summary }}</p>

          <form class="card mt-7 space-y-6 p-5 sm:p-6" novalidate @submit.prevent="submit">
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

            <p v-if="formError" class="rounded-2xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700" role="alert">{{ formError }}</p>

            <div class="flex items-center gap-4 pt-1">
              <div class="min-w-0 flex-1">
                <p class="text-xs text-stone-400">应付</p>
                <p class="text-2xl font-semibold tracking-tight text-stone-900 tabular-nums">
                  <span class="mr-0.5 text-base font-medium">¥</span>{{ yuanShort(total) }}
                </p>
              </div>
              <button type="submit" class="btn-primary h-12 flex-1 text-base" :disabled="soldOut || submitting">
                {{ soldOut ? '已售罄' : submitting ? '正在下单…' : '去付款' }}
              </button>
            </div>
          </form>
        </div>
      </div>

      <section v-if="product.description" class="mt-12 max-w-3xl sm:mt-16">
        <h2 class="mb-3 flex items-center gap-2 text-xs font-medium tracking-[0.2em] text-stone-500">
          <span class="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />商品详情
        </h2>
        <HtmlContent :html="product.description" class="text-stone-700" />
      </section>
    </template>
  </div>
</template>
