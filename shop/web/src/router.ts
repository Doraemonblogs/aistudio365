import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./views/HomeView.vue') },
    { path: '/p/:id(\\d+)', component: () => import('./views/ProductView.vue'), props: true },
    { path: '/pay/:orderNo', component: () => import('./views/PayView.vue'), props: true },
    { path: '/order/:orderNo', component: () => import('./views/OrderView.vue'), props: true },
    { path: '/orders', component: () => import('./views/OrdersView.vue') },
    { path: '/:pathMatch(.*)*', component: () => import('./views/NotFoundView.vue') },
  ],
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
});
