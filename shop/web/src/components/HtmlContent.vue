<script setup lang="ts">
import DOMPurify from 'dompurify';
import { computed } from 'vue';

const props = defineProps<{ html: string }>();

// Admin-written HTML, sanitised before it reaches the page; links open in a new tab.
const safe = computed(() => {
  const clean = DOMPurify.sanitize(props.html, { ADD_ATTR: ['target'] });
  return clean.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ');
});
</script>

<template>
  <div class="rich" v-html="safe" />
</template>
