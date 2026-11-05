<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import type { CouponKind } from '../../api';
import { beijingDay, copyText, couponCondition, couponDates, couponText, errorMessage } from '../../format';
import { adminApi, type AdminCoupon, type AdminProduct, type CouponInput } from '../api';

// Every coupon is a single-use code anyone can use; a batch is just several of them.
import { toast } from '../state';

const KINDS = [
  { key: 'amount', text: '立减金额' },
  { key: 'rate', text: '打折' },
] as const;

const DAY_MS = 86_400_000;
const today = () => beijingDay(new Date().toISOString());
const daysFromToday = (n: number) => beijingDay(new Date(Date.now() + n * DAY_MS).toISOString());

const form = reactive({
  name: '',
  kind: 'amount' as CouponKind,
  amount: '',
  rate: '',
  minAmount: '',
  allProducts: true,
  productIds: [] as number[],
  startsOn: today(),
  endsOn: daysFromToday(29),
  count: '1',
  code: '',
  prefix: '',
});
const count = computed(() => Number(form.count));

const products = ref<AdminProduct[]>([]);
const shopName = ref('');
const saving = ref(false);
const error = ref('');
const created = ref<AdminCoupon[]>([]);

onMounted(async () => {
  try {
    const [items, settings] = await Promise.all([adminApi.products(), adminApi.settings()]);
    products.value = items;
    shopName.value = settings.shop_name;
  } catch (e) {
    toast(errorMessage(e), 'error');
  }
});

const cents = (yuan: string) => Math.round(Number(yuan) * 100);
const value = computed(() => (form.kind === 'amount' ? cents(form.amount) : Math.round(Number(form.rate) * 10)));

/** How the coupon will read to a buyer, while it is being filled in. */
const preview = computed(() => {
  if (!(value.value > 0)) return '';
  const terms = {
    kind: form.kind,
    value: value.value,
    min_amount: cents(form.minAmount || '0'),
    starts_at: form.startsOn ? new Date(`${form.startsOn}T00:00:00+08:00`).toISOString() : null,
    ends_at: form.endsOn ? new Date(Date.parse(`${form.endsOn}T00:00:00+08:00`) + DAY_MS).toISOString() : null,
  };
  return `${couponText(terms)} · ${couponCondition(terms)} · ${couponDates(terms)}`;
});

function setRange(days: number | null) {
  form.startsOn = today();
  form.endsOn = days === null ? '' : daysFromToday(days - 1);
}

function check(): string {
  if (form.kind === 'amount' && !(cents(form.amount) >= 1)) return '请填写优惠金额';
  if (form.kind === 'rate') {
    const rate = Number(form.rate);
    if (!(rate >= 0.1 && rate <= 9.9)) return '折扣请填 0.1 到 9.9 之间，比如 8.5 表示 8.5 折';
  }
  if (form.minAmount && !(Number(form.minAmount) >= 0)) return '使用门槛金额不正确';
  if (!form.allProducts && form.productIds.length === 0) return '请至少选一个商品，或者改为全部商品';
  if (form.startsOn && form.endsOn && form.endsOn < form.startsOn) return '结束日期要晚于开始日期';
  if (!(Number.isInteger(count.value) && count.value >= 1 && count.value <= 500)) return '张数请填 1 到 500';
  return '';
}

async function submit() {
  error.value = check();
  if (error.value) return;
  saving.value = true;
  try {
    const input: CouponInput = {
      name: form.name.trim(),
      kind: form.kind,
      value: value.value,
      min_amount: cents(form.minAmount || '0'),
      product_ids: form.allProducts ? [] : form.productIds,
      starts_on: form.startsOn || null,
      ends_on: form.endsOn || null,
      count: count.value,
      // A typed code only makes sense for a single coupon; a batch gets random codes.
      code: count.value === 1 ? form.code.trim() || undefined : undefined,
      prefix: count.value > 1 ? form.prefix.trim() || undefined : undefined,
    };
    const result = await adminApi.createCoupons(input);
    const ids = new Set(result.ids);
    created.value = (await adminApi.coupons()).filter((c) => ids.has(c.id));
    toast(`已生成 ${result.created} 张优惠券`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    saving.value = false;
  }
}

/** A message to paste into WeChat for each coupon. */
function message(c: AdminCoupon): string {
  const terms = `${couponText(c)}（${couponCondition(c)}，${couponDates(c)}）`;
  const shop = shopName.value || '本店';
  const link = window.location.origin;
  return `【${shop}】送你一张优惠券：${terms}。下单时填写券码 ${c.code} 即可，限用一次。下单地址：${link}`;
}

async function copyAll(kind: 'codes' | 'messages') {
  const text = created.value.map((c) => (kind === 'messages' ? message(c) : c.code)).join(kind === 'messages' ? '\n\n' : '\n');
  const ok = await copyText(text);
  toast(ok ? '已复制' : '复制失败，请手动选择', ok ? 'ok' : 'error');
}

function another() {
  created.value = [];
  form.code = '';
}
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-4">
    <RouterLink to="/admin/marketing" class="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-900">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4" aria-hidden="true">
        <path d="M12 5l-5 5 5 5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      优惠券
    </RouterLink>

    <!-- Done: the new codes, ready to send. -->
    <section v-if="created.length" class="card space-y-4 p-5">
      <div>
        <h1 class="text-lg font-semibold text-stone-900">已生成 {{ created.length }} 张优惠券</h1>
        <p class="mt-1 text-sm text-stone-500">{{ couponText(created[0]!) }} · {{ couponCondition(created[0]!) }} · {{ couponDates(created[0]!) }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-primary h-10 px-4 text-sm" @click="copyAll('messages')">复制发放文案</button>
        <button type="button" class="btn-secondary h-10 px-4 text-sm" @click="copyAll('codes')">复制全部券码</button>
      </div>
      <ul class="max-h-80 divide-y divide-stone-100 overflow-y-auto rounded-2xl bg-stone-50 px-4">
        <li v-for="c in created" :key="c.id" class="flex items-center justify-between gap-3 py-2.5 text-sm">
          <span class="font-mono font-semibold text-stone-900">{{ c.code }}</span>
          <span class="text-stone-400">限用一次</span>
        </li>
      </ul>
      <p class="rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
        发放文案示例：{{ message(created[0]!) }}
      </p>
      <div class="flex flex-wrap gap-2 border-t border-stone-100 pt-4">
        <button type="button" class="btn-secondary h-10 px-4 text-sm" @click="another">再建一批</button>
        <RouterLink to="/admin/marketing" class="btn-secondary h-10 px-4 text-sm">查看全部优惠券</RouterLink>
      </div>
    </section>

    <form v-else class="space-y-4" novalidate @submit.prevent="submit">
      <section class="card space-y-5 p-5">
        <h1 class="text-lg font-semibold text-stone-900">新建优惠券</h1>

        <div>
          <label for="coupon-name" class="label">名称 <span class="text-stone-400">选填</span></label>
          <input id="coupon-name" v-model="form.name" class="input" maxlength="40" placeholder="比如：双十一、老客回馈（只在后台显示）" />
        </div>

        <div>
          <span class="label">优惠方式</span>
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="kind in KINDS"
              :key="kind.key"
              type="button"
              class="h-11 rounded-2xl text-sm font-medium transition"
              :class="form.kind === kind.key ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:text-stone-900'"
              @click="form.kind = kind.key"
            >{{ kind.text }}</button>
          </div>
          <div class="mt-3 flex items-center gap-2">
            <template v-if="form.kind === 'amount'">
              <span class="text-sm text-stone-500">减</span>
              <input v-model="form.amount" type="number" min="0.01" step="0.01" inputmode="decimal" class="input w-36" placeholder="20" aria-label="优惠金额" />
              <span class="text-sm text-stone-500">元</span>
            </template>
            <template v-else>
              <span class="text-sm text-stone-500">打</span>
              <input v-model="form.rate" type="number" min="0.1" max="9.9" step="0.1" inputmode="decimal" class="input w-36" placeholder="8.5" aria-label="折扣" />
              <span class="text-sm text-stone-500">折</span>
            </template>
          </div>
        </div>

        <div>
          <label for="coupon-min" class="label">使用门槛</label>
          <div class="flex items-center gap-2">
            <span class="text-sm text-stone-500">满</span>
            <input id="coupon-min" v-model="form.minAmount" type="number" min="0" step="0.01" inputmode="decimal" class="input w-36" placeholder="0" />
            <span class="text-sm text-stone-500">元可用，不填就是无门槛</span>
          </div>
        </div>

        <div>
          <span class="label">适用商品</span>
          <div class="flex flex-wrap gap-4 text-sm text-stone-700">
            <label class="inline-flex items-center gap-2"><input v-model="form.allProducts" type="radio" :value="true" class="accent-stone-900" /> 全部商品</label>
            <label class="inline-flex items-center gap-2"><input v-model="form.allProducts" type="radio" :value="false" class="accent-stone-900" /> 指定商品</label>
          </div>
          <div v-if="!form.allProducts" class="mt-3 max-h-64 space-y-1 overflow-y-auto rounded-2xl bg-stone-50 p-3">
            <label v-for="p in products" :key="p.id" class="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-sm hover:bg-white">
              <input v-model="form.productIds" type="checkbox" :value="p.id" class="h-4 w-4 accent-stone-900" />
              <span class="min-w-0 flex-1 truncate text-stone-800">{{ p.name }}</span>
              <span class="text-stone-400 tabular-nums">¥{{ p.price / 100 }}</span>
            </label>
          </div>
        </div>

        <div>
          <span class="label">有效期</span>
          <div class="flex flex-wrap items-center gap-2">
            <input v-model="form.startsOn" type="date" class="input h-11 w-40 px-3 text-sm" aria-label="开始日期" />
            <span class="text-stone-400">至</span>
            <input v-model="form.endsOn" type="date" class="input h-11 w-40 px-3 text-sm" aria-label="结束日期" />
          </div>
          <div class="mt-2 flex flex-wrap gap-2 text-xs">
            <button v-for="d in [7, 30, 90]" :key="d" type="button" class="rounded-full bg-stone-100 px-3 py-1 text-stone-600 hover:bg-stone-200" @click="setRange(d)">
              {{ d }} 天
            </button>
            <button type="button" class="rounded-full bg-stone-100 px-3 py-1 text-stone-600 hover:bg-stone-200" @click="setRange(null)">长期有效</button>
          </div>
          <p class="mt-1.5 text-xs text-stone-400">包含结束那一天，按北京时间。结束日期留空就是长期有效。</p>
        </div>
      </section>

      <section class="card space-y-4 p-5">
        <div>
          <h2 class="text-base font-semibold text-stone-900">券码</h2>
          <p class="mt-1 text-sm text-stone-500">每张券只能用一次，谁拿到都能用。要发给几个人就生成几张。</p>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label for="coupon-count" class="label">生成几张</label>
            <input id="coupon-count" v-model="form.count" type="number" min="1" max="500" step="1" class="input" />
          </div>
          <div v-if="count === 1">
            <label for="coupon-code" class="label">券码 <span class="text-stone-400">留空自动生成</span></label>
            <input id="coupon-code" v-model="form.code" class="input font-mono uppercase" maxlength="32" placeholder="比如 DOUBLE11" />
          </div>
          <div v-else>
            <label for="coupon-prefix" class="label">券码前缀 <span class="text-stone-400">选填</span></label>
            <input id="coupon-prefix" v-model="form.prefix" class="input font-mono uppercase" maxlength="10" placeholder="比如 VIP" />
          </div>
        </div>
      </section>

      <div class="sticky bottom-4 z-10 flex items-center gap-3 rounded-2xl bg-white/95 p-3 shadow-soft ring-1 ring-stone-200 backdrop-blur">
        <p class="min-w-0 flex-1 truncate text-sm" :class="error ? 'text-rose-600' : 'text-stone-500'">
          {{ error || preview || '填好优惠方式后点生成' }}
        </p>
        <button type="submit" class="btn-primary h-11 shrink-0 px-6" :disabled="saving">{{ saving ? '正在生成…' : '生成优惠券' }}</button>
      </div>
    </form>
  </div>
</template>
