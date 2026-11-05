<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import HtmlContent from '../../components/HtmlContent.vue';
import { htmlToMarkdown, markdownToHtml } from '../markdown';

const props = withDefaults(defineProps<{ modelValue: string; label: string; rows?: number; placeholder?: string; hint?: string }>(), {
  rows: 6,
  placeholder: '',
  hint: '',
});
const emit = defineEmits<{ 'update:modelValue': [html: string] }>();

// The value stays HTML (what the storefront shows); the box holds Markdown.
const text = ref(htmlToMarkdown(props.modelValue));
let emitted = props.modelValue;
watch(
  () => props.modelValue,
  (html) => {
    // Content loaded from the server replaces the box; our own edits don't bounce back.
    if (html === emitted) return;
    emitted = html;
    text.value = htmlToMarkdown(html);
  },
);

const html = computed(() => markdownToHtml(text.value));
function commit() {
  emitted = html.value;
  emit('update:modelValue', emitted);
}

// Narrow screens switch between the box and the preview; wide ones show both side by side.
const tab = ref<'edit' | 'preview'>('edit');
const tabs = [
  { key: 'edit', text: '编辑' },
  { key: 'preview', text: '预览' },
] as const;
const box = ref<HTMLTextAreaElement | null>(null);

type Change = { value: string; start: number; end: number };
async function change(edit: (value: string, start: number, end: number) => Change) {
  const el = box.value;
  if (!el) return;
  const result = edit(text.value, el.selectionStart, el.selectionEnd);
  text.value = result.value;
  commit();
  await nextTick();
  el.focus();
  el.setSelectionRange(result.start, result.end);
}

/** Puts marks around the selection, or around a placeholder that is left selected for typing over. */
function wrap(before: string, after: string, placeholder: string) {
  void change((value, start, end) => {
    const inner = value.slice(start, end) || placeholder;
    return {
      value: value.slice(0, start) + before + inner + after + value.slice(end),
      start: start + before.length,
      end: start + before.length + inner.length,
    };
  });
}

/** Starts every selected line (or the cursor's line) with a prefix such as "- ". */
function prefixLines(prefix: (index: number) => string) {
  void change((value, start, end) => {
    const from = value.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = value.indexOf('\n', end);
    const to = lineEnd === -1 ? value.length : lineEnd;
    const block = value
      .slice(from, to)
      .split('\n')
      .map((line, i) => prefix(i) + line)
      .join('\n');
    return { value: value.slice(0, from) + block + value.slice(to), start: from, end: from + block.length };
  });
}

const tools = [
  { label: 'B', title: '加粗（Ctrl+B）', bold: true, run: () => wrap('**', '**', '加粗文字') },
  { label: '标题', title: '小标题', run: () => prefixLines(() => '### ') },
  { label: '• 列表', title: '列表', run: () => prefixLines(() => '- ') },
  { label: '1. 编号', title: '编号列表', run: () => prefixLines((i) => `${i + 1}. `) },
  { label: '链接', title: '插入链接', run: () => wrap('[', '](https://)', '链接文字') },
];
</script>

<template>
  <div>
    <div class="mb-1.5 flex items-center justify-between gap-3">
      <span class="text-sm font-medium text-slate-700">{{ label }}</span>
      <div class="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium md:hidden" role="tablist">
        <button
          v-for="item in tabs"
          :key="item.key"
          type="button"
          role="tab"
          :aria-selected="tab === item.key"
          class="rounded-md px-2.5 py-1"
          :class="tab === item.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'"
          @click="tab = item.key"
        >{{ item.text }}</button>
      </div>
    </div>

    <div class="grid gap-3 md:grid-cols-2">
      <div
        class="overflow-hidden rounded-xl border border-slate-300 bg-white transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100"
        :class="{ 'hidden md:block': tab === 'preview' }"
      >
        <div class="flex flex-wrap gap-0.5 border-b border-slate-200 bg-slate-50 px-1.5 py-1">
          <button
            v-for="tool in tools"
            :key="tool.label"
            type="button"
            :title="tool.title"
            class="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-white hover:text-slate-900"
            :class="{ 'font-bold': tool.bold }"
            @click="tool.run"
          >{{ tool.label }}</button>
        </div>
        <textarea
          ref="box"
          v-model="text"
          :rows="rows"
          :placeholder="placeholder"
          :aria-label="label"
          class="block w-full resize-y bg-transparent px-3.5 py-2.5 text-[15px] leading-6 text-slate-900 outline-none placeholder:text-slate-400"
          @input="commit"
          @keydown.ctrl.b.prevent="tools[0]!.run()"
          @keydown.meta.b.prevent="tools[0]!.run()"
        />
      </div>

      <div
        class="min-h-24 rounded-xl bg-slate-50 px-3.5 py-2.5 ring-1 ring-slate-200 ring-inset"
        :class="{ 'hidden md:block': tab === 'edit' }"
        aria-live="polite"
      >
        <p class="mb-1 hidden text-[11px] font-medium tracking-wide text-slate-400 md:block">预览</p>
        <HtmlContent v-if="html" :html="html" />
        <p v-else class="text-sm text-slate-400">还没有内容</p>
      </div>
    </div>

    <p class="mt-1 text-xs leading-5 text-slate-400">
      <template v-if="hint">{{ hint }}</template>
      回车换行，空一行分段；<code class="text-slate-500">**文字**</code> 加粗，<code class="text-slate-500">- </code> 开头是列表。
    </p>
  </div>
</template>
