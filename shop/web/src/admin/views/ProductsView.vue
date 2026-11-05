<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { errorMessage, yuanShort } from '../../format';
import { adminApi, type AdminCategory, type AdminProduct } from '../api';
import { askConfirm, toast } from '../state';

const products = ref<AdminProduct[]>([]);
const categories = ref<AdminCategory[]>([]);
const loaded = ref(false);
const filter = ref<'all' | 'on' | 'off'>('all');
const busyId = ref<number | null>(null);
const vFocus = { mounted: (el: HTMLElement) => el.focus() };

const showCategories = ref(false);
const newCategory = ref('');
const editingCategory = ref<number | null>(null);
const categoryDraft = ref('');

async function load() {
  try {
    [products.value, categories.value] = await Promise.all([adminApi.products(), adminApi.categories()]);
  } catch (e) {
    toast(errorMessage(e), 'error');
  } finally {
    loaded.value = true;
  }
}
onMounted(() => {
  document.title = '商品 - 管理后台';
  void load();
});

const visible = computed(() => products.value.filter((p) => filter.value === 'all' || p.status === filter.value));
/** Products grouped under their category, in the order the storefront shows them. */
const groups = computed(() => {
  const map = new Map<string, AdminProduct[]>();
  for (const product of visible.value) {
    const key = product.category_name ?? '未分类';
    map.set(key, [...(map.get(key) ?? []), product]);
  }
  return [...map.entries()].map(([name, items]) => ({ name, items }));
});
const counts = computed(() => ({
  all: products.value.length,
  on: products.value.filter((p) => p.status === 'on').length,
  off: products.value.filter((p) => p.status === 'off').length,
}));

function stockText(p: AdminProduct): { text: string; tone: string } {
  if (p.card_mode === 'pool') {
    const tone = p.cards_available === 0 ? 'text-rose-600' : p.cards_available <= 5 ? 'text-amber-600' : 'text-stone-600';
    return { text: `卡密 ${p.cards_available} 张`, tone };
  }
  if (p.available === null) return { text: '库存不限', tone: 'text-stone-500' };
  return { text: `库存 ${p.available}`, tone: p.available === 0 ? 'text-rose-600' : p.available <= 5 ? 'text-amber-600' : 'text-stone-600' };
}

async function toggle(p: AdminProduct) {
  const next = p.status === 'on' ? 'off' : 'on';
  busyId.value = p.id;
  try {
    await adminApi.setProductStatus(p.id, next);
    p.status = next;
    toast(next === 'on' ? `已上架：${p.name}` : `已下架：${p.name}`);
  } catch (e) {
    toast(errorMessage(e), 'error');
  } finally {
    busyId.value = null;
  }
}

// ---- categories ----
async function addCategory() {
  const name = newCategory.value.trim();
  if (!name) return;
  try {
    // New categories go to the top: one above the current highest sort.
    const sort = Math.max(0, ...categories.value.map((c) => c.sort)) + 1;
    await adminApi.createCategory(name, sort);
    newCategory.value = '';
    toast('分类已添加');
    categories.value = await adminApi.categories();
  } catch (e) {
    toast(errorMessage(e), 'error');
  }
}

function startRename(c: AdminCategory) {
  editingCategory.value = c.id;
  categoryDraft.value = c.name;
}

async function rename(c: AdminCategory) {
  const name = categoryDraft.value.trim();
  if (!name || name === c.name) {
    editingCategory.value = null;
    return;
  }
  try {
    await adminApi.updateCategory(c.id, name, c.sort);
    editingCategory.value = null;
    toast('分类已改名');
    await load();
  } catch (e) {
    toast(errorMessage(e), 'error');
  }
}

/** Swap with the neighbour, then renumber the whole list (sort is descending) so ties can't reorder others. */
async function move(index: number, delta: -1 | 1) {
  const order = [...categories.value];
  const [moved] = order.splice(index, 1);
  if (!moved || index + delta < 0 || index + delta > order.length) return;
  order.splice(index + delta, 0, moved);
  try {
    await Promise.all(
      order.map((c, i) => (c.sort === order.length - i ? null : adminApi.updateCategory(c.id, c.name, order.length - i))),
    );
    await load();
  } catch (e) {
    toast(errorMessage(e), 'error');
  }
}

async function removeCategory(c: AdminCategory) {
  const ok = await askConfirm({
    title: '删除分类',
    message: c.products > 0 ? `“${c.name}”下有 ${c.products} 个商品，删除后它们会变成“未分类”，商品本身不受影响。` : `删除分类“${c.name}”？`,
    confirmText: '删除',
    danger: true,
  });
  if (!ok) return;
  try {
    await adminApi.deleteCategory(c.id);
    toast('分类已删除');
    await load();
  } catch (e) {
    toast(errorMessage(e), 'error');
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-2">
      <button
        v-for="item in [{ key: 'all', label: '全部' }, { key: 'on', label: '在售' }, { key: 'off', label: '已下架' }] as const"
        :key="item.key"
        type="button"
        class="rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 ring-inset transition"
        :class="filter === item.key ? 'bg-stone-900 text-white ring-stone-900' : 'bg-white text-stone-600 ring-stone-200 hover:bg-stone-100'"
        @click="filter = item.key"
      >
        {{ item.label }}
        <span class="ml-0.5 tabular-nums" :class="filter === item.key ? 'text-stone-300' : 'text-stone-400'">{{ counts[item.key] }}</span>
      </button>
      <div class="ml-auto flex gap-2">
        <button type="button" class="btn-secondary h-9 px-3.5 text-sm" :aria-expanded="showCategories" @click="showCategories = !showCategories">
          分类管理
        </button>
        <RouterLink to="/admin/products/new" class="btn-primary h-9 px-3.5 text-sm">新增商品</RouterLink>
      </div>
    </div>

    <section v-if="showCategories" class="card p-4">
      <h2 class="text-base font-semibold text-stone-900">分类</h2>
      <p class="mt-0.5 text-xs text-stone-500">排在上面的分类在商店首页也排在前面。</p>
      <ul class="mt-3 divide-y divide-stone-100">
        <li v-for="(c, i) in categories" :key="c.id" class="flex items-center gap-2 py-2">
          <template v-if="editingCategory === c.id">
            <input v-model="categoryDraft" v-focus class="input h-9 min-w-0 text-sm" maxlength="30" @keydown.enter.prevent="rename(c)" @keydown.esc="editingCategory = null" />
            <button type="button" class="btn-primary h-9 shrink-0 px-3 text-sm" @click="rename(c)">保存</button>
            <button type="button" class="btn-secondary h-9 shrink-0 px-3 text-sm" @click="editingCategory = null">取消</button>
          </template>
          <template v-else>
            <span class="min-w-0 flex-1 truncate text-sm text-stone-900">{{ c.name }} <span class="text-stone-400">· {{ c.products }} 个商品</span></span>
            <button type="button" class="rounded-lg px-2 py-1 text-stone-500 hover:bg-stone-100 disabled:opacity-30" :disabled="i === 0" aria-label="上移" @click="move(i, -1)">↑</button>
            <button type="button" class="rounded-lg px-2 py-1 text-stone-500 hover:bg-stone-100 disabled:opacity-30" :disabled="i === categories.length - 1" aria-label="下移" @click="move(i, 1)">↓</button>
            <button type="button" class="rounded-lg px-2 py-1 text-sm text-blue-600 hover:bg-blue-50" @click="startRename(c)">改名</button>
            <button type="button" class="rounded-lg px-2 py-1 text-sm text-rose-600 hover:bg-rose-50" @click="removeCategory(c)">删除</button>
          </template>
        </li>
        <li v-if="categories.length === 0" class="py-2 text-sm text-stone-500">还没有分类</li>
      </ul>
      <form class="mt-3 flex gap-2" @submit.prevent="addCategory">
        <input v-model="newCategory" class="input h-10 text-sm" maxlength="30" placeholder="新分类名称" />
        <button type="submit" class="btn-primary h-10 shrink-0 px-4 text-sm" :disabled="!newCategory.trim()">添加</button>
      </form>
    </section>

    <p v-if="loaded && visible.length === 0" class="card p-10 text-center text-sm text-stone-500">
      {{ products.length === 0 ? '还没有商品，点右上角“新增商品”开始' : '这个筛选下没有商品' }}
    </p>

    <section v-for="group in groups" :key="group.name">
      <h2 class="mb-2 px-1 text-sm font-semibold text-stone-500">{{ group.name }}</h2>
      <ul class="card divide-y divide-stone-100 overflow-hidden">
        <li v-for="p in group.items" :key="p.id" class="flex items-center gap-3 p-3 sm:p-4">
          <RouterLink :to="`/admin/products/${p.id}`" class="flex min-w-0 flex-1 items-center gap-3">
            <div class="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-stone-100" :class="{ 'opacity-50 grayscale': p.status === 'off' }">
              <img v-if="p.image" :src="p.image" alt="" class="h-full w-full object-cover" loading="lazy" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-[15px] font-medium" :class="p.status === 'off' ? 'text-stone-400' : 'text-stone-900'">{{ p.name }}</p>
              <p class="mt-0.5 flex flex-wrap items-baseline gap-x-3 text-sm">
                <span class="font-semibold text-stone-900 tabular-nums">¥{{ yuanShort(p.price) }}</span>
                <span :class="stockText(p).tone">{{ stockText(p).text }}</span>
                <span class="text-stone-400">已售 {{ p.sold }}</span>
                <span v-if="p.pending > 0" class="text-amber-600">待付 {{ p.pending }}</span>
              </p>
            </div>
          </RouterLink>
          <button
            type="button"
            role="switch"
            :aria-checked="p.status === 'on'"
            :aria-label="p.status === 'on' ? '在售，点击下架' : '已下架，点击上架'"
            class="flex shrink-0 items-center gap-2 rounded-lg px-1.5 py-1 text-xs font-medium"
            :class="p.status === 'on' ? 'text-emerald-700' : 'text-stone-400'"
            :disabled="busyId === p.id"
            @click="toggle(p)"
          >
            <span class="hidden sm:inline">{{ p.status === 'on' ? '在售' : '已下架' }}</span>
            <span class="relative inline-flex h-6 w-10 items-center rounded-full transition" :class="p.status === 'on' ? 'bg-emerald-500' : 'bg-stone-300'">
              <span class="absolute h-5 w-5 rounded-full bg-white shadow transition-all" :class="p.status === 'on' ? 'left-[18px]' : 'left-0.5'" />
            </span>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>
