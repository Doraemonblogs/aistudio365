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
    <RouterLink to="/" class="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4" aria-hidden="true">
        <path d="M12 5l-5 5 5 5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      全部商品
    </RouterLink>

    <div v-if="loadError" class="card p-10 text-center">
      <p class="text-slate-600">{{ loadError }}</p>
      <RouterLink to="/" class="btn-secondary mt-4">返回首页</RouterLink>
    </div>

    <div v-else-if="!product" class="grid gap-4 md:grid-cols-[5fr_6fr]">
      <div class="card aspect-square animate-pulse" />
      <div class="card h-80 animate-pulse" />
    </div>

    <template v-else>
      <div class="grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:items-start md:gap-6">
        <div class="card overflow-hidden">
          <img
            v-if="product.image"
            :src="product.image"
            :alt="product.name"
            class="aspect-square w-full object-cover"
            :class="{ 'opacity-60 grayscale': soldOut }"
          />
        </div>

        <div class="space-y-4">
          <section class="card p-4 sm:p-5">
            <h1 class="text-lg leading-7 font-bold text-slate-900 sm:text-xl">{{ product.name }}</h1>
            <div class="mt-3 flex items-center justify-between gap-3">
              <PriceTag :price="product.price" :original="product.original_price" large />
              <StockBadge :status="product.stock_status" />
            </div>
            <p v-if="product.summary" class="mt-3 text-sm leading-6 text-slate-500">{{ product.summary }}</p>
          </section>

          <form class="card space-y-5 p-4 sm:p-5" novalidate @submit.prevent="submit">
            <div>
              <span class="label">购买数量</span>
              <div class="flex items-center gap-3">
                <div class="inline-flex items-center rounded-xl ring-1 ring-slate-300">
                  <button
                    type="button"
                    class="h-10 w-10 text-lg text-slate-600 disabled:text-slate-300"
                    :disabled="soldOut || quantity <= 1"
                    aria-label="减少"
                    @click="changeQuantity(-1)"
                  >−</button>
                  <span class="w-10 text-center font-semibold text-slate-900 tabular-nums">{{ quantity }}</span>
                  <button
                    type="button"
                    class="h-10 w-10 text-lg text-slate-600 disabled:text-slate-300"
                    :disabled="soldOut || quantity >= product.max_qty"
                    aria-label="增加"
                    @click="changeQuantity(1)"
                  >+</button>
                </div>
                <span v-if="!soldOut" class="text-xs text-slate-400">每单最多 {{ product.max_qty }} 件</span>
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
                placeholder="用于查询订单，客服也会核对"
                class="input"
                :class="{ 'border-rose-400 focus:border-rose-400 focus:ring-rose-100': phoneInvalid }"
                @blur="phoneTouched = true"
              />
              <p v-if="phoneInvalid" class="mt-1.5 text-xs text-rose-600">请输入正确的 11 位手机号</p>
            </div>

            <div>
              <span class="label">支付方式</span>
              <div class="grid grid-cols-2 gap-3" role="radiogroup" aria-label="支付方式">
                <button
                  type="button"
                  role="radio"
                  :aria-checked="payMethod === 'wechat'"
                  class="flex h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-semibold ring-1 ring-inset transition"
                  :class="payMethod === 'wechat' ? 'bg-wechat/10 text-wechat ring-2 ring-wechat' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'"
                  @click="payMethod = 'wechat'"
                >
                  <span class="h-2.5 w-2.5 rounded-full bg-wechat" aria-hidden="true" />
                  微信
                </button>
                <button
                  type="button"
                  role="radio"
                  :aria-checked="payMethod === 'alipay'"
                  class="flex h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-semibold ring-1 ring-inset transition"
                  :class="payMethod === 'alipay' ? 'bg-alipay/10 text-alipay ring-2 ring-alipay' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'"
                  @click="payMethod = 'alipay'"
                >
                  <span class="h-2.5 w-2.5 rounded-full bg-alipay" aria-hidden="true" />
                  支付宝
                </button>
              </div>
            </div>

            <div class="flex items-center justify-between border-t border-slate-100 pt-4">
              <span class="text-sm text-slate-500">应付</span>
              <span class="text-2xl font-bold tracking-tight text-rose-600">
                <span class="mr-px text-base">¥</span>{{ yuanShort(total) }}
              </span>
            </div>

            <p v-if="formError" class="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{{ formError }}</p>

            <button type="submit" class="btn-primary h-12 w-full text-base" :disabled="soldOut || submitting">
              {{ soldOut ? '已售罄' : submitting ? '正在下单…' : '去付款' }}
            </button>
          </form>
        </div>
      </div>

      <section v-if="product.description" class="card mt-4 p-4 sm:mt-6 sm:p-6">
        <h2 class="mb-2 text-base font-semibold text-slate-900">商品详情</h2>
        <HtmlContent :html="product.description" />
      </section>
    </template>
  </div>
</template>
