import { createRouter, createWebHistory } from 'vue-router';
import { ensureAdmin } from './admin/state';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: () => import('./views/HomeView.vue'),
      // A product opens as a dialog over the list, so the list stays where the buyer left it.
      children: [{ path: 'p/:id(\\d+)', component: () => import('./views/ProductDialog.vue'), props: true }],
    },
    { path: '/pay/:orderNo', component: () => import('./views/PayView.vue'), props: true },
    { path: '/order/:orderNo', component: () => import('./views/OrderView.vue'), props: true },
    { path: '/orders', component: () => import('./views/OrdersView.vue') },

    { path: '/admin/login', component: () => import('./admin/views/LoginView.vue') },
    {
      path: '/admin',
      component: () => import('./admin/AdminLayout.vue'),
      children: [
        { path: '', redirect: '/admin/orders' },
        { path: 'orders', component: () => import('./admin/views/OrdersView.vue') },
        { path: 'products', component: () => import('./admin/views/ProductsView.vue') },
        { path: 'products/:id(new|\\d+)', component: () => import('./admin/views/ProductEditView.vue'), props: true },
        { path: 'marketing', component: () => import('./admin/views/CouponsView.vue') },
        { path: 'marketing/new', component: () => import('./admin/views/CouponCreateView.vue') },
        { path: 'stats', component: () => import('./admin/views/StatsView.vue') },
        { path: 'settings', component: () => import('./admin/views/SettingsView.vue') },
        { path: 'settings/password', component: () => import('./admin/views/PasswordView.vue') },
        { path: ':pathMatch(.*)*', redirect: '/admin/orders' },
      ],
    },

    { path: '/:pathMatch(.*)*', component: () => import('./views/NotFoundView.vue') },
  ],
  scrollBehavior: (to, from, saved) => {
    // Opening or closing a product, or switching category, keeps the list where it was.
    const onHome = (r: typeof to) => r.matched[0]?.path === '/';
    if (onHome(to) && onHome(from)) return false;
    return saved ?? { top: 0 };
  },
});

/** Every admin page except the login needs a signed-in session. */
router.beforeEach(async (to) => {
  if (!to.path.startsWith('/admin') || to.path === '/admin/login') return true;
  if (await ensureAdmin()) return true;
  return { path: '/admin/login', query: to.path === '/admin' ? {} : { redirect: to.fullPath } };
});
