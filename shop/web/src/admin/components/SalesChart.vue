<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { DailySales } from '../api';

/**
 * Daily sales as a single-series bar chart: one hue, thin bars with 4px rounded tops anchored to
 * the baseline and a 2px gap, a quiet grid, the busiest day labelled, and a tooltip per bar.
 * Drawn at the container's real width so labels keep their size on a phone.
 */
const props = defineProps<{ rows: DailySales[] }>();

const wrap = ref<HTMLElement | null>(null);
const width = ref(720);
const hover = ref<number | null>(null);
let observer: ResizeObserver | undefined;

onMounted(() => {
  if (!wrap.value) return;
  width.value = wrap.value.clientWidth || 720;
  observer = new ResizeObserver(([entry]) => {
    if (entry) width.value = Math.max(280, Math.round(entry.contentRect.width));
  });
  observer.observe(wrap.value);
});
onBeforeUnmount(() => observer?.disconnect());

const HEIGHT = 220;
const M = { top: 22, right: 8, bottom: 26, left: 48 };
const GAP = 2;

const innerW = computed(() => width.value - M.left - M.right);
const innerH = HEIGHT - M.top - M.bottom;

/** Round steps of 1, 2 or 5 × 10^n yuan; about four gridlines. */
const ticks = computed(() => {
  const maxYuan = Math.max(...props.rows.map((r) => r.amount / 100), 0);
  if (maxYuan === 0) return [0, 100, 200, 300];
  const raw = maxYuan / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].find((m) => m * power >= raw) ?? 10) * power;
  const count = Math.ceil(maxYuan / step);
  return Array.from({ length: count + 1 }, (_, i) => i * step);
});
const yMaxCents = computed(() => (ticks.value.at(-1) ?? 1) * 100);

const band = computed(() => innerW.value / Math.max(1, props.rows.length));
const barW = computed(() => Math.max(1, band.value - GAP));
const xOf = (i: number) => M.left + i * band.value + GAP / 2;
const yOf = (cents: number) => M.top + innerH - (cents / yMaxCents.value) * innerH;
const baseline = M.top + innerH;

function barPath(i: number, cents: number): string {
  const x = xOf(i);
  const w = barW.value;
  const top = yOf(cents);
  const h = baseline - top;
  const r = Math.min(4, w / 2, h);
  return `M${x},${baseline} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${baseline} Z`;
}

const peak = computed(() => {
  let best = -1;
  props.rows.forEach((row, i) => {
    if (row.amount > 0 && (best < 0 || row.amount > (props.rows[best]?.amount ?? 0))) best = i;
  });
  return best;
});

const yuanLabel = (yuan: number) => (yuan >= 10_000 ? `${(yuan / 10_000).toFixed(yuan % 10_000 ? 1 : 0)}万` : String(yuan));
const money = (cents: number) => `¥${(cents / 100).toFixed(2).replace(/\.00$/, '')}`;
const shortDate = (date: string) => `${date.slice(5, 7)}/${date.slice(8, 10)}`;
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
// Noon in Beijing is the same calendar day in UTC, so getUTCDay gives the Beijing weekday.
const weekday = (date: string) => WEEKDAYS[new Date(`${date}T12:00:00+08:00`).getUTCDay()] ?? '';

/** Label every 5th day, counted back from today so the last bar is always labelled. */
const showLabel = (i: number) => (props.rows.length - 1 - i) % (width.value < 480 ? 7 : 5) === 0;

/** Date labels sit centred under their bar, except near the right edge where they end at the bar. */
function dateLabel(i: number): { x: number; anchor: 'middle' | 'end' } {
  const centre = xOf(i) + barW.value / 2;
  return centre + 18 > width.value - M.right ? { x: xOf(i) + barW.value, anchor: 'end' } : { x: centre, anchor: 'middle' };
}

function onPointer(event: PointerEvent) {
  const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
  const x = event.clientX - rect.left - M.left;
  const i = Math.floor(x / band.value);
  hover.value = i >= 0 && i < props.rows.length ? i : null;
}

const tip = computed(() => {
  if (hover.value === null) return null;
  const row = props.rows[hover.value];
  if (!row) return null;
  const centre = xOf(hover.value) + barW.value / 2;
  return { row, left: `${(centre / width.value) * 100}%`, alignRight: centre > width.value * 0.7, alignLeft: centre < width.value * 0.3 };
});

const total = computed(() => props.rows.reduce((sum, r) => sum + r.amount, 0));
</script>

<template>
  <div ref="wrap" class="relative">
    <svg
      :width="width"
      :height="HEIGHT"
      :viewBox="`0 0 ${width} ${HEIGHT}`"
      role="img"
      :aria-label="`最近 ${rows.length} 天每日销售额，合计 ${money(total)}`"
      class="block touch-pan-y select-none"
      @pointermove="onPointer"
      @pointerdown="onPointer"
      @pointerleave="hover = null"
    >
      <g>
        <template v-for="tick in ticks" :key="tick">
          <line :x1="M.left" :x2="width - M.right" :y1="yOf(tick * 100)" :y2="yOf(tick * 100)" class="stroke-stone-200" stroke-width="1" />
          <text :x="M.left - 8" :y="yOf(tick * 100) + 4" text-anchor="end" class="fill-stone-500 text-[11px] tabular-nums">
            {{ tick === 0 ? '0' : `¥${yuanLabel(tick)}` }}
          </text>
        </template>
      </g>
      <line :x1="M.left" :x2="width - M.right" :y1="baseline" :y2="baseline" class="stroke-stone-300" stroke-width="1" />

      <g>
        <template v-for="(row, i) in rows" :key="row.date">
          <rect
            v-if="hover === i"
            :x="M.left + i * band"
            :y="M.top"
            :width="band"
            :height="innerH"
            class="fill-stone-100"
          />
          <path v-if="row.amount > 0" :d="barPath(i, row.amount)" :class="hover === i ? 'fill-blue-700' : 'fill-blue-600'" />
          <text
            v-if="showLabel(i)"
            :x="dateLabel(i).x"
            :y="HEIGHT - 8"
            :text-anchor="dateLabel(i).anchor"
            class="fill-stone-500 text-[11px] tabular-nums"
          >{{ shortDate(row.date) }}</text>
        </template>
      </g>

      <text
        v-if="peak >= 0 && hover === null"
        :x="Math.min(Math.max(xOf(peak) + barW / 2, M.left + 24), width - M.right - 24)"
        :y="yOf(rows[peak]?.amount ?? 0) - 6"
        text-anchor="middle"
        class="fill-stone-700 text-[11px] font-semibold tabular-nums"
      >{{ money(rows[peak]?.amount ?? 0) }}</text>
    </svg>

    <div
      v-if="tip"
      class="pointer-events-none absolute top-1 z-10 rounded-lg bg-stone-900 px-3 py-2 text-xs leading-5 whitespace-nowrap text-white shadow-lg"
      :style="{ left: tip.left, transform: tip.alignRight ? 'translateX(-100%)' : tip.alignLeft ? 'none' : 'translateX(-50%)' }"
    >
      <p class="text-stone-300">{{ tip.row.date }} 周{{ weekday(tip.row.date) }}</p>
      <p class="font-semibold tabular-nums">{{ money(tip.row.amount) }} · {{ tip.row.orders }} 单</p>
    </div>
  </div>
</template>
