<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import HtmlContent from '../../components/HtmlContent.vue';
import { htmlToEditable, looksLikeHtml, textToHtml } from '../text';

const props = withDefaults(defineProps<{ modelValue: string; label: string; rows?: number; placeholder?: string; hint?: string }>(), {
  rows: 6,
  placeholder: '',
  hint: '直接输入文字，一行一段；也可以写 HTML。',
});
const emit = defineEmits<{ 'update:modelValue': [html: string] }>();

const text = ref(htmlToEditable(props.modelValue));
const preview = ref(false);
const isHtml = computed(() => looksLikeHtml(text.value));

// Content loaded from the server replaces what is in the box; our own edits don't bounce back.
watch(
  () => props.modelValue,
  (html) => {
    if (html !== textToHtml(text.value)) text.value = htmlToEditable(html);
  },
);

function onInput() {
  emit('update:modelValue', textToHtml(text.value));
}

/** Drops all formatting (bold, colours) and keeps one line per paragraph, for content imported as HTML. */
function toPlain() {
  const doc = new DOMParser().parseFromString(text.value.replace(/<\/p>|<br\s*\/?>/gi, '\n'), 'text/html');
  text.value = (doc.body.textContent ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
  onInput();
}
</script>

<template>
  <div>
    <div class="mb-1.5 flex items-center justify-between gap-3">
      <span class="text-sm font-medium text-slate-700">{{ label }}</span>
      <div class="flex gap-3">
        <button v-if="isHtml && !preview" type="button" class="text-xs font-medium text-slate-500 hover:text-slate-800" title="去掉加粗、颜色等格式，只保留文字" @click="toPlain">
          转为纯文本
        </button>
        <button type="button" class="text-xs font-medium text-blue-600" @click="preview = !preview">{{ preview ? '编辑' : '预览' }}</button>
      </div>
    </div>
    <div v-if="preview" class="min-h-24 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <HtmlContent v-if="props.modelValue" :html="props.modelValue" />
      <p v-else class="text-sm text-slate-400">（空）</p>
    </div>
    <textarea
      v-else
      v-model="text"
      :rows="rows"
      :placeholder="placeholder"
      class="input h-auto py-2.5 leading-6"
      :class="{ 'font-mono text-[13px]': isHtml }"
      @input="onInput"
    />
    <p class="mt-1 text-xs text-slate-400">{{ hint }}</p>
  </div>
</template>
