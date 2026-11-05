<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { errorMessage } from '../../format';
import { adminApi, type ShopSettings } from '../api';
import ImageUpload from '../components/ImageUpload.vue';
import RichTextField from '../components/RichTextField.vue';
import { adminState, askConfirm, toast } from '../state';

const form = reactive({
  shop_name: '',
  logo: '',
  notice: '',
  contact_wechat: '',
  contact_qq: '',
  qr_wechat: '',
  qr_alipay: '',
  order_timeout_minutes: '60',
});
const snapshot = ref('');
const dirty = computed(() => snapshot.value !== '' && JSON.stringify(form) !== snapshot.value);
const loaded = ref(false);
const saving = ref(false);
const error = ref('');

function apply(settings: ShopSettings) {
  Object.assign(form, { ...settings, order_timeout_minutes: String(settings.order_timeout_minutes) });
  snapshot.value = JSON.stringify(form);
}

onMounted(async () => {
  document.title = '设置 - 管理后台';
  window.addEventListener('beforeunload', beforeUnload);
  try {
    apply(await adminApi.settings());
  } catch (e) {
    toast(errorMessage(e), 'error');
  } finally {
    loaded.value = true;
  }
});

async function save() {
  error.value = '';
  const timeout = Number(form.order_timeout_minutes);
  if (!form.shop_name.trim()) {
    error.value = '请填写店铺名称';
    return;
  }
  if (!Number.isInteger(timeout) || timeout < 5 || timeout > 1440) {
    error.value = '付款时限请填 5–1440 分钟';
    return;
  }
  saving.value = true;
  try {
    apply(
      await adminApi.saveSettings({
        ...form,
        shop_name: form.shop_name.trim(),
        contact_wechat: form.contact_wechat.trim(),
        contact_qq: form.contact_qq.trim(),
        order_timeout_minutes: timeout,
      }),
    );
    toast('设置已保存');
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    saving.value = false;
  }
}

onBeforeRouteLeave(async () => {
  if (!dirty.value) return true;
  return askConfirm({ title: '还没保存', message: '设置有修改还没保存，离开后修改会丢失。', confirmText: '不保存，离开', cancelText: '继续编辑', danger: true });
});
const beforeUnload = (event: BeforeUnloadEvent) => {
  if (dirty.value) event.preventDefault();
};
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload));
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <div v-if="!loaded" class="card h-96 animate-pulse" />
    <form v-else class="space-y-4" novalidate @submit.prevent="save">
      <section class="card space-y-4 p-4 sm:p-5">
        <h2 class="text-base font-semibold text-slate-900">店铺</h2>
        <div>
          <label for="shop-name" class="label">店铺名称</label>
          <input id="shop-name" v-model="form.shop_name" class="input" maxlength="60" />
        </div>
        <ImageUpload v-model="form.logo" label="店铺 Logo" hint="显示在商店左上角，正方形效果最好。" />
        <RichTextField v-model="form.notice" label="首页公告" :rows="4" placeholder="选填，显示在商店首页顶部" />
      </section>

      <section class="card space-y-4 p-4 sm:p-5">
        <div>
          <h2 class="text-base font-semibold text-slate-900">客服</h2>
          <p class="mt-0.5 text-xs text-slate-500">买家付款后会看到这里的联系方式，按提示把付款截图发给客服。</p>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label for="wechat" class="label">客服微信号</label>
            <input id="wechat" v-model="form.contact_wechat" class="input" maxlength="60" autocapitalize="off" />
          </div>
          <div>
            <label for="qq" class="label">客服 QQ <span class="font-normal text-slate-400">选填</span></label>
            <input id="qq" v-model="form.contact_qq" class="input" maxlength="30" inputmode="numeric" />
          </div>
        </div>
      </section>

      <section class="card space-y-4 p-4 sm:p-5">
        <div>
          <h2 class="text-base font-semibold text-slate-900">通用收款码</h2>
          <p class="mt-0.5 text-xs leading-5 text-slate-500">不带金额的个人收款码，买家扫码后自己输入订单金额。商品设置了固定金额收款码时，买 1 件优先用商品自己的码。</p>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <ImageUpload v-model="form.qr_wechat" label="微信收款码" />
          <ImageUpload v-model="form.qr_alipay" label="支付宝收款码" />
        </div>
        <p v-if="!form.qr_wechat || !form.qr_alipay" class="rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
          {{ !form.qr_wechat && !form.qr_alipay ? '两个收款码都没有上传' : !form.qr_wechat ? '还没有上传微信收款码' : '还没有上传支付宝收款码' }}，买家选这种方式时会看不到付款码。
        </p>
      </section>

      <section class="card space-y-4 p-4 sm:p-5">
        <h2 class="text-base font-semibold text-slate-900">订单</h2>
        <div class="sm:max-w-xs">
          <label for="timeout" class="label">付款时限（分钟）</label>
          <input id="timeout" v-model="form.order_timeout_minutes" class="input" inputmode="numeric" />
          <p class="mt-1.5 text-xs leading-5 text-slate-500">下单后这么久还没付款，订单自动取消、库存退回。只影响之后的新订单。</p>
        </div>
      </section>

      <section class="card flex items-center justify-between gap-3 p-4 sm:p-5">
        <div>
          <h2 class="text-base font-semibold text-slate-900">账号</h2>
          <p class="mt-0.5 text-sm text-slate-500">当前登录：{{ adminState.username }}</p>
        </div>
        <RouterLink to="/admin/settings/password" class="btn-secondary h-9 px-4 text-sm">修改密码</RouterLink>
      </section>

      <div class="sticky bottom-0 z-20 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:shadow-sm">
        <div class="flex items-center justify-end gap-3">
          <span v-if="error" class="mr-auto text-sm text-rose-600" role="alert">{{ error }}</span>
          <span v-else-if="dirty" class="mr-auto text-sm text-amber-700">有修改未保存</span>
          <button type="submit" class="btn-primary h-10 px-6 text-sm" :disabled="saving || !dirty">{{ saving ? '保存中…' : '保存设置' }}</button>
        </div>
      </div>
    </form>
  </div>
</template>
