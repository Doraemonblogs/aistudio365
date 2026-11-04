import { createApp } from 'vue';
import App from './App.vue';
import { setUnauthorizedHandler } from './admin/api';
import { adminState } from './admin/state';
import { router } from './router';
import './style.css';

// A session that expires while the admin is open sends them back to the login page.
setUnauthorizedHandler(() => {
  adminState.username = '';
  const current = router.currentRoute.value;
  if (current.path.startsWith('/admin') && current.path !== '/admin/login') {
    void router.replace({ path: '/admin/login', query: { redirect: current.fullPath } });
  }
});

const app = createApp(App).use(router);
// Wait for the first route so the page doesn't flash the storefront layout on /admin.
void router.isReady().then(() => app.mount('#app'));
