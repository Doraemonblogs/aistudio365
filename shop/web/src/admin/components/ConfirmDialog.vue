<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { confirmState, settleConfirm } from '../state';

function onKey(event: KeyboardEvent) {
  if (confirmState.open && event.key === 'Escape') settleConfirm(false);
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div
    v-if="confirmState.open"
    class="fixed inset-0 z-40 flex items-end justify-center bg-stone-900/40 p-4 sm:items-center"
    @click.self="settleConfirm(false)"
  >
    <div class="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" role="alertdialog" aria-modal="true" :aria-label="confirmState.title">
      <h2 class="text-base font-semibold text-stone-900">{{ confirmState.title }}</h2>
      <p class="mt-2 text-sm leading-6 whitespace-pre-line text-stone-600">{{ confirmState.message }}</p>
      <div class="mt-5 grid grid-cols-2 gap-3">
        <button type="button" class="btn-secondary" @click="settleConfirm(false)">{{ confirmState.cancelText }}</button>
        <button
          type="button"
          class="btn-primary"
          :class="{ 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800': confirmState.danger }"
          @click="settleConfirm(true)"
        >
          {{ confirmState.confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>
