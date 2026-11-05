<script setup lang="ts">
import { ref } from 'vue';
import { copyText } from '../format';

const props = withDefaults(defineProps<{ text: string; label?: string }>(), { label: '复制' });
const copied = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

async function copy() {
  if (!(await copyText(props.text))) return;
  copied.value = true;
  clearTimeout(timer);
  timer = setTimeout(() => (copied.value = false), 1500);
}
</script>

<template>
  <button
    type="button"
    class="shrink-0 rounded-full px-3 py-1 text-xs font-medium transition"
    :class="copied ? 'bg-emerald-100/70 text-emerald-800' : 'bg-stone-900/5 text-stone-700 hover:bg-stone-900/10'"
    @click="copy"
  >
    {{ copied ? '已复制' : label }}
  </button>
</template>
