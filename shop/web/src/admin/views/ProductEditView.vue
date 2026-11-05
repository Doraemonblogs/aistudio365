<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import { errorMessage, formatTime } from '../../format';
import { adminApi, type AdminCard, type AdminCategory, type AdminProduct, type ProductInput } from '../api';
import ImageUpload from '../components/ImageUpload.vue';
import RichTextField from '../components/RichTextField.vue';
import { askConfirm, toast } from '../state';
import { centsToYuan, yuanToCents } from '../text';

const props = defineProps<{ id: string }>();
const router = useRouter();

const DEFAULT_CARD_TEXT = '请联系微信客服';

interface Form {
  name: string;
  category_id: number | null;
  summary: string;
  description: string;
  instructions: string;
  price: string;
  original_price: string;
  image: string;
  qr_wechat: string;
  qr_alipay: string;
  unlimited: boolean;
  stock: string;
  max_qty: string;
  card_mode: 'fixed' | 'pool';
  card_text: string;
  status: 'on' | 'off';
  sort: string;
}

const blank = (): Form => ({
  name: '',
  category_id: null,
  summary: '',
  description: '',
  instructions: '',
  price: '',
  original_price: '',
  image: '',
  qr_wechat: '',
  qr_alipay: '',
  unlimited: true,
  stock: '',
  max_qty: '10',
  card_mode: 'fixed',
  card_text: DEFAULT_CARD_TEXT,
  status: 'on',
  sort: '0',
});

const fromProduct = (p: AdminProduct): Form => ({
  name: p.name,
  category_id: p.category_id,
  summary: p.summary,
  description: p.description,
  instructions: p.instructions,
  price: centsToYuan(p.price),
  original_price: centsToYuan(p.original_price),
  image: p.image,
  qr_wechat: p.qr_wechat,
  qr_alipay: p.qr_alipay,
  unlimited: p.stock < 0,
  stock: p.stock < 0 ? '' : String(p.stock),
  max_qty: String(p.max_qty),
  card_mode: p.card_mode,
  card_text: p.card_text,
  status: p.status,
  sort: String(p.sort),
});

const isNew = computed(() => props.id === 'new');
const product = ref<AdminProduct | null>(null);
const categories = ref<AdminCategory[]>([]);
const form = reactive<Form>(blank());
const snapshot = ref(JSON.stringify(form));
const dirty = computed(() => JSON.stringify(form) !== snapshot.value);
const loadError = ref('');
const loaded = ref(false);
const saving = ref(false);
const errors = ref<Partial<Record<keyof Form, string>>>({});

function reset(next: Form) {
  Object.assign(form, next);
  snapshot.value = JSON.stringify(form);
  errors.value = {};
}

watch(
  () => props.id,
  async (id) => {
    // Right after creating a product the URL switches to its id; the form already holds it.
    if (product.value && String(product.value.id) === id) return;
    loaded.value = false;
    loadError.value = '';
    try {
      const [cats, p] = await Promise.all([adminApi.categories(), id === 'new' ? Promise.resolve(null) : adminApi.product(Number(id))]);
      categories.value = cats;
      product.value = p;
      reset(p ? fromProduct(p) : blank());
      document.title = `${p ? p.name : '新增商品'} - 管理后台`;
      if (p?.card_mode === 'pool') void loadCards();
    } catch (e) {
      loadError.value = errorMessage(e);
    } finally {
      loaded.value = true;
    }
  },
  { immediate: true },
);

// A field's error goes away as soon as it is edited.
watch(
  () => ({ ...form }),
  (now, before) => {
    for (const key of Object.keys(errors.value) as (keyof Form)[]) {
      if (now[key] !== before[key] || (key === 'stock' && now.unlimited !== before.unlimited)) delete errors.value[key];
    }
  },
);

function intIn(text: string, min: number, max: number): number | null {
  const value = text.trim();
  if (!/^-?\d+$/.test(value)) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

function validate(): ProductInput | null {
  const found: Partial<Record<keyof Form, string>> = {};
  const price = yuanToCents(form.price);
  const original = form.original_price.trim() ? yuanToCents(form.original_price) : null;
  const stock = form.unlimited ? -1 : intIn(form.stock, 0, 1_000_000);
  const maxQty = intIn(form.max_qty, 1, 1000);
  const sort = intIn(form.sort || '0', -100_000, 100_000);
  if (!form.name.trim()) found.name = '请填写商品名称';
  if (price === null) found.price = '请填写正确的价格，例如 125 或 9.90';
  if (form.original_price.trim() && original === null) found.original_price = '原价格式不正确';
  if (form.card_mode === 'fixed' && stock === null) found.stock = '库存请填 0 或正整数';
  if (maxQty === null) found.max_qty = '每单限购请填 1–1000';
  if (sort === null) found.sort = '排序请填整数';
  if (form.card_mode === 'fixed' && !form.card_text.trim()) found.card_text = '请填写买家付款后看到的内容';
  errors.value = found;
  if (Object.keys(found).length > 0) {
    toast('有内容需要修改，请看标红的地方', 'error');
    return null;
  }
  return {
    category_id: form.category_id,
    name: form.name.trim(),
    summary: form.summary.trim(),
    description: form.description,
    instructions: form.instructions,
    price: price!,
    original_price: original,
    image: form.image,
    qr_wechat: form.qr_wechat,
    qr_alipay: form.qr_alipay,
    // A card pool counts its own stock; keep whatever the fixed-mode number was.
    stock: form.card_mode === 'pool' ? (product.value?.stock ?? -1) : stock!,
    max_qty: maxQty!,
    card_mode: form.card_mode,
    card_text: form.card_text.trim(),
    status: form.status,
    sort: sort!,
  };
}

async function save() {
  const input = validate();
  if (!input) return;
  saving.value = true;
  try {
    const saved = isNew.value ? await adminApi.createProduct(input) : await adminApi.updateProduct(product.value!.id, input);
    const created = isNew.value;
    product.value = saved;
    reset(fromProduct(saved));
    document.title = `${saved.name} - 管理后台`;
    if (created) {
      await router.replace(`/admin/products/${saved.id}`);
      toast(saved.card_mode === 'pool' ? '商品已创建，现在可以在下方导入卡密' : '商品已创建');
    } else {
      toast('已保存');
    }
    if (saved.card_mode === 'pool') void loadCards();
  } catch (e) {
    toast(errorMessage(e), 'error');
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!product.value) return;
  const ok = await askConfirm({
    title: '删除商品',
    message: `删除“${product.value.name}”？删除后不能恢复。已经有订单的商品不能删除，可以改为下架。`,
    confirmText: '删除',
    danger: true,
  });
  if (!ok) return;
  try {
    await adminApi.deleteProduct(product.value.id);
    snapshot.value = JSON.stringify(form);
    toast('商品已删除');
    await router.replace('/admin/products');
  } catch (e) {
    toast(errorMessage(e), 'error');
  }
}

// ---- leaving with unsaved changes ----
onBeforeRouteLeave(async () => {
  if (!dirty.value) return true;
  return askConfirm({ title: '还没保存', message: '这个商品有修改还没保存，离开后修改会丢失。', confirmText: '不保存，离开', cancelText: '继续编辑', danger: true });
});
const beforeUnload = (event: BeforeUnloadEvent) => {
  if (dirty.value) event.preventDefault();
};
onMounted(() => window.addEventListener('beforeunload', beforeUnload));
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload));

// ---- card pool ----
const cards = ref<AdminCard[]>([]);
const cardFilter = ref<'available' | 'sold'>('available');
const importText = ref('');
const importing = ref(false);
const importLines = computed(() => importText.value.split(/\r?\n/).filter((line) => line.trim()).length);

async function loadCards() {
  if (!product.value) return;
  try {
    cards.value = await adminApi.cards(product.value.id, cardFilter.value);
  } catch (e) {
    toast(errorMessage(e), 'error');
  }
}
watch(cardFilter, () => loadCards());

async function refreshCounts() {
  if (!product.value) return;
  const fresh = await adminApi.product(product.value.id);
  Object.assign(product.value, {
    cards_available: fresh.cards_available,
    cards_sold: fresh.cards_sold,
    available: fresh.available,
    pending: fresh.pending,
    sold: fresh.sold,
  });
}

async function importCards() {
  if (!product.value || importLines.value === 0) return;
  importing.value = true;
  try {
    const result = await adminApi.importCards(product.value.id, importText.value);
    importText.value = '';
    toast(`导入了 ${result.added} 张${result.skipped ? `，${result.skipped} 张重复已跳过` : ''}`);
    cardFilter.value = 'available';
    await Promise.all([loadCards(), refreshCounts()]);
  } catch (e) {
    toast(errorMessage(e), 'error');
  } finally {
    importing.value = false;
  }
}

async function deleteCard(card: AdminCard) {
  const ok = await askConfirm({ title: '删除卡密', message: `删除这张卡密？\n${card.content}`, confirmText: '删除', danger: true });
  if (!ok) return;
  try {
    await adminApi.deleteCard(card.id);
    cards.value = cards.value.filter((c) => c.id !== card.id);
    await refreshCounts();
  } catch (e) {
    toast(errorMessage(e), 'error');
  }
}

const savedAsPool = computed(() => product.value?.card_mode === 'pool');
const fieldClass = (key: keyof Form) => (errors.value[key] ? 'border-rose-400 focus:border-rose-400 focus:ring-rose-100' : '');
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <RouterLink to="/admin/products" class="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4" aria-hidden="true">
        <path d="M12 5l-5 5 5 5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      商品列表
    </RouterLink>

    <div v-if="loadError" class="card p-10 text-center">
      <p class="text-slate-600">{{ loadError }}</p>
      <RouterLink to="/admin/products" class="btn-secondary mt-4">返回商品列表</RouterLink>
    </div>
    <div v-else-if="!loaded" class="card h-96 animate-pulse" />

    <form v-else class="space-y-4" novalidate @submit.prevent="save">
      <div class="flex items-center justify-between gap-3">
        <h1 class="truncate text-xl font-bold text-slate-900">{{ isNew ? '新增商品' : '编辑商品' }}</h1>
        <a v-if="product && product.status === 'on'" :href="`/p/${product.id}`" target="_blank" rel="noopener" class="shrink-0 text-sm text-blue-600">在商店查看</a>
      </div>

      <!-- Basics -->
      <section class="card space-y-4 p-4 sm:p-5">
        <h2 class="text-base font-semibold text-slate-900">基本信息</h2>
        <div>
          <label for="name" class="label">商品名称</label>
          <input id="name" v-model="form.name" class="input" :class="fieldClass('name')" maxlength="200" />
          <p v-if="errors.name" class="mt-1.5 text-xs text-rose-600">{{ errors.name }}</p>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label for="category" class="label">分类</label>
            <select id="category" v-model="form.category_id" class="input">
              <option :value="null">未分类</option>
              <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </div>
          <div>
            <label for="sort" class="label">排序 <span class="font-normal text-slate-400">数字越大越靠前</span></label>
            <input id="sort" v-model="form.sort" class="input" :class="fieldClass('sort')" inputmode="numeric" />
            <p v-if="errors.sort" class="mt-1.5 text-xs text-rose-600">{{ errors.sort }}</p>
          </div>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label for="price" class="label">售价（元）</label>
            <input id="price" v-model="form.price" class="input" :class="fieldClass('price')" inputmode="decimal" placeholder="例如 125" />
            <p v-if="errors.price" class="mt-1.5 text-xs text-rose-600">{{ errors.price }}</p>
          </div>
          <div>
            <label for="original" class="label">原价（元） <span class="font-normal text-slate-400">选填，显示为划线价</span></label>
            <input id="original" v-model="form.original_price" class="input" :class="fieldClass('original_price')" inputmode="decimal" />
            <p v-if="errors.original_price" class="mt-1.5 text-xs text-rose-600">{{ errors.original_price }}</p>
          </div>
        </div>
        <div>
          <label for="summary" class="label">简介 <span class="font-normal text-slate-400">选填，显示在价格下面</span></label>
          <input id="summary" v-model="form.summary" class="input" maxlength="500" />
        </div>
        <ImageUpload v-model="form.image" label="商品图片" hint="建议正方形，PNG / JPG，不超过 5 MB。" />
        <div class="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-3">
          <div>
            <p class="text-sm font-medium text-slate-900">{{ form.status === 'on' ? '在售' : '已下架' }}</p>
            <p class="text-xs text-slate-500">{{ form.status === 'on' ? '商店里可以看到并购买' : '商店里看不到，已有订单不受影响' }}</p>
          </div>
          <button
            type="button"
            role="switch"
            :aria-checked="form.status === 'on'"
            aria-label="在售"
            class="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition"
            :class="form.status === 'on' ? 'bg-emerald-500' : 'bg-slate-300'"
            @click="form.status = form.status === 'on' ? 'off' : 'on'"
          >
            <span class="absolute h-6 w-6 rounded-full bg-white shadow transition-all" :class="form.status === 'on' ? 'left-[22px]' : 'left-0.5'" />
          </button>
        </div>
      </section>

      <!-- Delivery -->
      <section class="card space-y-4 p-4 sm:p-5">
        <div>
          <h2 class="text-base font-semibold text-slate-900">卡密</h2>
          <p class="mt-0.5 text-xs text-slate-500">买家点「我已付款」（或你在后台确认收款）后，在订单页看到的内容。</p>
        </div>
        <div class="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="卡密方式">
          <button
            v-for="mode in [
              { key: 'fixed', title: '统一内容', text: '每个买家看到同样的文字，比如“请联系微信客服”' },
              { key: 'pool', title: '卡密池', text: '一件一张，从导入的卡密里按顺序发出' },
            ] as const"
            :key="mode.key"
            type="button"
            role="radio"
            :aria-checked="form.card_mode === mode.key"
            class="rounded-xl p-3.5 text-left ring-1 ring-inset transition"
            :class="form.card_mode === mode.key ? 'bg-blue-50 ring-2 ring-blue-500' : 'bg-white ring-slate-200 hover:bg-slate-50'"
            @click="form.card_mode = mode.key"
          >
            <p class="text-sm font-semibold" :class="form.card_mode === mode.key ? 'text-blue-700' : 'text-slate-900'">{{ mode.title }}</p>
            <p class="mt-0.5 text-xs leading-5 text-slate-500">{{ mode.text }}</p>
          </button>
        </div>

        <div v-if="form.card_mode === 'fixed'">
          <label for="card-text" class="label">卡密内容</label>
          <textarea id="card-text" v-model="form.card_text" rows="3" class="input h-auto py-2.5 leading-6" :class="fieldClass('card_text')" maxlength="5000" />
          <p v-if="errors.card_text" class="mt-1.5 text-xs text-rose-600">{{ errors.card_text }}</p>
          <p v-else-if="savedAsPool && (product?.cards_available ?? 0) > 0" class="mt-1.5 text-xs text-amber-700">
            卡密池里还有 {{ product?.cards_available }} 张未售出，改成统一内容后它们不会再发出（不会被删除）。
          </p>
        </div>
        <p v-else-if="!savedAsPool" class="rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
          {{ isNew ? '先保存商品，然后在这里导入卡密。' : '保存后在这里导入卡密。' }}没有可用卡密时，商品显示为缺货。
        </p>

        <div class="grid gap-4 sm:grid-cols-2">
          <div v-if="form.card_mode === 'fixed'">
            <span class="label">库存</span>
            <label class="mb-2 flex items-center gap-2 text-sm text-slate-700">
              <input v-model="form.unlimited" type="checkbox" class="h-4 w-4 rounded border-slate-300 text-blue-600" />
              不限库存
            </label>
            <input
              v-if="!form.unlimited"
              v-model="form.stock"
              class="input"
              :class="fieldClass('stock')"
              inputmode="numeric"
              aria-label="库存数量"
              placeholder="剩余可卖数量"
            />
            <p v-if="errors.stock" class="mt-1.5 text-xs text-rose-600">{{ errors.stock }}</p>
            <p v-else-if="!form.unlimited && product && product.pending > 0" class="mt-1.5 text-xs text-slate-500">
              另有 {{ product.pending }} 件被待付款订单占用，超时取消后会退回。
            </p>
          </div>
          <div>
            <label for="max-qty" class="label">每单限购</label>
            <input id="max-qty" v-model="form.max_qty" class="input" :class="fieldClass('max_qty')" inputmode="numeric" />
            <p v-if="errors.max_qty" class="mt-1.5 text-xs text-rose-600">{{ errors.max_qty }}</p>
          </div>
        </div>
      </section>

      <!-- Card pool -->
      <section v-if="savedAsPool && form.card_mode === 'pool' && product" class="card space-y-4 p-4 sm:p-5">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="text-base font-semibold text-slate-900">卡密池</h2>
          <p class="text-sm text-slate-500">
            可用 <span class="font-semibold text-slate-900 tabular-nums">{{ product.cards_available }}</span>
            · 已售 <span class="tabular-nums">{{ product.cards_sold }}</span>
            <template v-if="product.pending > 0"> · 待付款占用 <span class="tabular-nums text-amber-700">{{ product.pending }}</span></template>
          </p>
        </div>
        <div>
          <label for="import" class="label">导入卡密 <span class="font-normal text-slate-400">一行一张，重复的会自动跳过</span></label>
          <textarea id="import" v-model="importText" rows="4" class="input h-auto py-2.5 font-mono text-[13px] leading-6" placeholder="卡号 密码" />
          <div class="mt-2 flex items-center justify-between gap-3">
            <span class="text-xs text-slate-400">{{ importLines ? `共 ${importLines} 行` : '' }}</span>
            <button type="button" class="btn-primary h-9 px-4 text-sm" :disabled="importing || importLines === 0" @click="importCards">
              {{ importing ? '导入中…' : '导入' }}
            </button>
          </div>
        </div>
        <div>
          <div class="mb-2 flex gap-2">
            <button
              v-for="item in [{ key: 'available', label: '可用' }, { key: 'sold', label: '已售' }] as const"
              :key="item.key"
              type="button"
              class="rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset"
              :class="cardFilter === item.key ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200'"
              @click="cardFilter = item.key"
            >{{ item.label }}</button>
          </div>
          <p v-if="cards.length === 0" class="rounded-xl bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
            {{ cardFilter === 'available' ? '没有可用卡密' : '还没有卖出的卡密' }}
          </p>
          <ul v-else class="max-h-96 divide-y divide-slate-100 overflow-y-auto rounded-xl ring-1 ring-slate-200">
            <li v-for="card in cards" :key="card.id" class="flex items-center gap-3 px-3 py-2">
              <span class="min-w-0 flex-1 font-mono text-[13px] break-all text-slate-800">{{ card.content }}</span>
              <span v-if="card.status === 'sold'" class="shrink-0 text-right text-xs text-slate-400">
                {{ card.order_no }}<br />{{ formatTime(card.sold_at) }}
              </span>
              <button v-else type="button" class="shrink-0 rounded-lg px-2 py-1 text-xs text-rose-600 hover:bg-rose-50" @click="deleteCard(card)">删除</button>
            </li>
          </ul>
        </div>
      </section>

      <!-- Content -->
      <section class="card space-y-5 p-4 sm:p-5">
        <h2 class="text-base font-semibold text-slate-900">说明</h2>
        <RichTextField v-model="form.description" label="商品详情" :rows="8" placeholder="商品页下方显示的详细介绍" />
        <RichTextField
          v-model="form.instructions"
          label="使用说明"
          :rows="4"
          placeholder="选填，付款确认后显示在订单页"
          hint="付款确认后才显示给买家。一行一段，也可以写 HTML。"
        />
      </section>

      <!-- Fixed-amount QR codes -->
      <section class="card space-y-4 p-4 sm:p-5">
        <div>
          <h2 class="text-base font-semibold text-slate-900">固定金额收款码 <span class="text-sm font-normal text-slate-400">选填</span></h2>
          <p class="mt-0.5 text-xs leading-5 text-slate-500">
            按这个商品的售价生成的收款码。买 1 件时用它，买家扫码不用输金额；买多件或没设置时，用“设置”里的通用收款码。改了售价记得换码。
          </p>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <ImageUpload v-model="form.qr_wechat" label="微信" />
          <ImageUpload v-model="form.qr_alipay" label="支付宝" />
        </div>
      </section>

      <div v-if="product" class="flex justify-end">
        <button type="button" class="rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50" @click="remove">删除商品</button>
      </div>

      <!-- Save bar -->
      <div class="sticky bottom-0 z-20 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:shadow-sm">
        <div class="flex items-center justify-end gap-3">
          <span v-if="dirty" class="mr-auto text-sm text-amber-700">有修改未保存</span>
          <span v-else-if="!isNew" class="mr-auto text-sm text-slate-400">已保存</span>
          <RouterLink to="/admin/products" class="btn-secondary h-10 px-4 text-sm">返回</RouterLink>
          <button type="submit" class="btn-primary h-10 px-6 text-sm" :disabled="saving || (!isNew && !dirty)">
            {{ saving ? '保存中…' : isNew ? '创建商品' : '保存' }}
          </button>
        </div>
      </div>
    </form>
  </div>
</template>
