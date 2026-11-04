<script setup lang="ts">
import { toasts } from '../state';
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 top-16 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
    <div
      v-for="item in toasts"
      :key="item.id"
      class="rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg"
      :class="item.tone === 'ok' ? 'bg-slate-900' : 'bg-rose-600'"
    >
      {{ item.text }}
    </div>
  </div>
</template>
