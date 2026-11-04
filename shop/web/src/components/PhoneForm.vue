<script setup lang="ts">
import { ref } from 'vue';
import { normalizePhone } from '../format';

const props = withDefaults(defineProps<{ initial?: string; submitLabel?: string; busy?: boolean }>(), {
  initial: '',
  submitLabel: '查询',
  busy: false,
});
const emit = defineEmits<{ submit: [phone: string] }>();

const phone = ref(props.initial);
const error = ref('');

function submit() {
  const normalized = normalizePhone(phone.value);
  if (!normalized) {
    error.value = '请输入正确的 11 位手机号';
    return;
  }
  error.value = '';
  emit('submit', normalized);
}
</script>

<template>
  <form class="flex flex-col gap-2.5 sm:flex-row" novalidate @submit.prevent="submit">
    <input
      v-model="phone"
      type="tel"
      inputmode="numeric"
      autocomplete="tel"
      maxlength="16"
      placeholder="下单时填写的手机号"
      class="input sm:flex-1"
      :aria-invalid="Boolean(error)"
    />
    <button type="submit" class="btn-primary sm:w-32" :disabled="busy">{{ busy ? '查询中…' : submitLabel }}</button>
  </form>
  <p v-if="error" class="mt-2 text-sm text-rose-600">{{ error }}</p>
</template>
