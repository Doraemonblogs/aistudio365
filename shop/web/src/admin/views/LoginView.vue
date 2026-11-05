<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { errorMessage } from '../../format';
import { adminApi } from '../api';
import { adminState } from '../state';

const route = useRoute();
const router = useRouter();
const username = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);

onMounted(() => {
  document.title = '登录 - 管理后台';
});

async function submit() {
  if (!username.value.trim() || !password.value) {
    error.value = '请输入用户名和密码';
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    adminState.username = (await adminApi.login(username.value.trim(), password.value)).username;
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/admin') ? route.query.redirect : '/admin/orders';
    await router.replace(redirect);
  } catch (e) {
    error.value = errorMessage(e);
    password.value = '';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center bg-stone-50 px-4">
    <form class="card w-full max-w-sm p-6" novalidate @submit.prevent="submit">
      <h1 class="text-xl font-bold text-stone-900">管理后台</h1>
      <p class="mt-1 text-sm text-stone-500">登录后处理订单和商品</p>
      <div class="mt-6 space-y-4">
        <div>
          <label for="username" class="label">用户名</label>
          <input id="username" v-model="username" class="input" autocomplete="username" autocapitalize="off" />
        </div>
        <div>
          <label for="password" class="label">密码</label>
          <input id="password" v-model="password" type="password" class="input" autocomplete="current-password" />
        </div>
      </div>
      <p v-if="error" class="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{{ error }}</p>
      <button type="submit" class="btn-primary mt-6 w-full" :disabled="busy">{{ busy ? '登录中…' : '登录' }}</button>
    </form>
  </div>
</template>
