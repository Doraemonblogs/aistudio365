<script setup lang="ts">
import { ref } from 'vue';
import { errorMessage } from '../../format';
import { adminApi } from '../api';
import { toast } from '../state';

const props = withDefaults(defineProps<{ modelValue: string; label: string; hint?: string; square?: boolean }>(), {
  hint: '',
  square: true,
});
const emit = defineEmits<{ 'update:modelValue': [url: string] }>();

const input = ref<HTMLInputElement | null>(null);
const uploading = ref(false);

async function pick(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    toast('图片太大了，单张不能超过 5 MB', 'error');
    return;
  }
  uploading.value = true;
  try {
    emit('update:modelValue', (await adminApi.upload(file)).url);
  } catch (e) {
    toast(errorMessage(e), 'error');
  } finally {
    uploading.value = false;
    if (input.value) input.value.value = '';
  }
}
</script>

<template>
  <div>
    <span class="label">{{ label }}</span>
    <div class="flex items-start gap-3">
      <button
        type="button"
        class="relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-50 text-xs text-slate-400 ring-1 ring-slate-200 transition hover:ring-blue-300"
        :class="square ? 'h-24 w-24' : 'h-24 w-40'"
        :disabled="uploading"
        @click="input?.click()"
      >
        <img v-if="props.modelValue" :src="props.modelValue" alt="" class="h-full w-full object-contain" />
        <span v-else>{{ uploading ? '上传中…' : '点击上传' }}</span>
        <span v-if="uploading && props.modelValue" class="absolute inset-0 flex items-center justify-center bg-white/70 text-slate-600">上传中…</span>
      </button>
      <div class="min-w-0 space-y-2 pt-1">
        <div class="flex gap-2">
          <button type="button" class="rounded-lg px-3 py-1.5 text-sm font-medium text-blue-600 ring-1 ring-blue-200 hover:bg-blue-50" :disabled="uploading" @click="input?.click()">
            {{ props.modelValue ? '更换' : '上传' }}
          </button>
          <button
            v-if="props.modelValue"
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
            @click="emit('update:modelValue', '')"
          >
            移除
          </button>
        </div>
        <p v-if="hint" class="text-xs leading-5 text-slate-500">{{ hint }}</p>
      </div>
    </div>
    <input ref="input" type="file" accept="image/png,image/jpeg,image/gif,image/webp" class="hidden" @change="pick" />
  </div>
</template>
