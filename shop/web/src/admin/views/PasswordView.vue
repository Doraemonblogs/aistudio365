<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { errorMessage } from '../../format';
import { adminApi } from '../api';
import { toast } from '../state';

const router = useRouter();
const current = ref('');
const next = ref('');
const repeat = ref('');
const error = ref('');
const busy = ref(false);

onMounted(() => {
  document.title = '修改密码 - 管理后台';
});

async function submit() {
  error.value = '';
  if (!current.value) error.value = '请输入当前密码';
  else if (next.value.length < 8) error.value = '新密码至少 8 位';
  else if (next.value !== repeat.value) error.value = '两次输入的新密码不一样';
  else if (next.value === current.value) error.value = '新密码不能和当前密码一样';
  if (error.value) return;
  busy.value = true;
  try {
    await adminApi.changePassword(current.value, next.value);
    toast('密码已修改，其他设备上的登录已退出');
    await router.replace('/admin/settings');
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-md">
    <RouterLink to="/admin/settings" class="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4" aria-hidden="true">
        <path d="M12 5l-5 5 5 5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      设置
    </RouterLink>
    <form class="card space-y-4 p-5" novalidate @submit.prevent="submit">
      <h1 class="text-lg font-bold text-slate-900">修改密码</h1>
      <div>
        <label for="current" class="label">当前密码</label>
        <input id="current" v-model="current" type="password" class="input" autocomplete="current-password" />
      </div>
      <div>
        <label for="next" class="label">新密码 <span class="font-normal text-slate-400">至少 8 位</span></label>
        <input id="next" v-model="next" type="password" class="input" autocomplete="new-password" />
      </div>
      <div>
        <label for="repeat" class="label">再输一次新密码</label>
        <input id="repeat" v-model="repeat" type="password" class="input" autocomplete="new-password" />
      </div>
      <p v-if="error" class="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{{ error }}</p>
      <button type="submit" class="btn-primary w-full" :disabled="busy">{{ busy ? '提交中…' : '确认修改' }}</button>
    </form>
  </div>
</template>
