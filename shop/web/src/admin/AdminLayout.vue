<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { adminApi } from './api';
import ConfirmDialog from './components/ConfirmDialog.vue';
import ToastHost from './components/ToastHost.vue';
import { adminState, askConfirm, refreshOrderBadge } from './state';

const route = useRoute();
const router = useRouter();
const links = [
  { to: '/admin/orders', label: '订单' },
  { to: '/admin/products', label: '商品' },
  { to: '/admin/marketing', label: '营销' },
  { to: '/admin/stats', label: '统计' },
  { to: '/admin/settings', label: '设置' },
];

let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  void refreshOrderBadge();
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') void refreshOrderBadge();
  }, 30_000);
});
onBeforeUnmount(() => clearInterval(timer));

async function logout() {
  if (!(await askConfirm({ title: '退出登录', message: '确定要退出管理后台吗？', confirmText: '退出' }))) return;
  await adminApi.logout().catch(() => undefined);
  adminState.username = '';
  await router.push('/admin/login');
}
</script>

<template>
  <div class="min-h-dvh bg-stone-50">
    <header class="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur">
      <div class="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <RouterLink to="/admin/orders" class="hidden shrink-0 text-[15px] font-bold text-stone-900 sm:block">管理后台</RouterLink>
        <nav class="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="后台导航">
          <RouterLink
            v-for="link in links"
            :key="link.to"
            :to="link.to"
            class="relative shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition"
            :class="route.path.startsWith(link.to) ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'"
          >
            {{ link.label }}
            <span
              v-if="link.to === '/admin/orders' && adminState.ordersToHandle > 0"
              class="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] leading-5 font-bold text-white"
            >{{ adminState.ordersToHandle }}</span>
          </RouterLink>
        </nav>
        <div class="flex shrink-0 items-center gap-1 text-sm">
          <a href="/" target="_blank" rel="noopener" class="hidden rounded-lg px-2.5 py-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800 sm:inline">查看商店</a>
          <button type="button" class="rounded-lg px-2.5 py-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800" @click="logout">退出</button>
        </div>
      </div>
    </header>
    <main class="mx-auto max-w-6xl px-4 py-5 pb-16 sm:px-6">
      <RouterView />
    </main>
    <ToastHost />
    <ConfirmDialog />
  </div>
</template>
