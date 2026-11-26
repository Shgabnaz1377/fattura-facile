<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/composables/useFormat'

/** Single-series monthly bar chart (no legend needed: the title names the series). */
const props = defineProps<{ title: string; valuesCents: number[]; year: number }>()
const { t, locale } = useI18n()
const fmt = useFormat()

// The SVG is drawn at the container's pixel width so text stays legible on phones.
const plotEl = ref<HTMLElement | null>(null)
const W = ref(640)
const H = 240
const PAD = { top: 12, right: 8, bottom: 28, left: 48 }
const plotW = computed(() => W.value - PAD.left - PAD.right)
const plotH = H - PAD.top - PAD.bottom
const slot = computed(() => plotW.value / 12)
const barW = computed(() => Math.max(6, Math.min(30, slot.value - 6)))
let observer: ResizeObserver | undefined
onMounted(() => {
  if (!plotEl.value) return
  W.value = Math.max(280, plotEl.value.clientWidth)
  if (typeof ResizeObserver === 'undefined') return
  observer = new ResizeObserver(([entry]) => {
    if (entry) W.value = Math.max(280, Math.round(entry.contentRect.width))
  })
  observer.observe(plotEl.value)
})
onBeforeUnmount(() => observer?.disconnect())

const months = computed(() =>
  Array.from({ length: 12 }, (_, m) =>
    new Intl.DateTimeFormat(locale.value === 'en' ? 'en-GB' : 'it-IT', { month: 'short' }).format(new Date(2026, m, 1)),
  ),
)

/** A "nice" axis maximum and 4 ticks. */
const scale = computed(() => {
  const max = Math.max(...props.valuesCents, 0)
  if (max === 0) return { max: 100_000, ticks: [0, 25_000, 50_000, 75_000, 100_000] }
  const rough = max / 4
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = ([1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? rough) as number
  const top = step * Math.ceil(max / step)
  return { max: top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) }
})

const y = (cents: number) => PAD.top + plotH - (cents / scale.value.max) * plotH

/** Bar with 4px rounded top corners, square at the baseline. */
function barPath(i: number, cents: number): string {
  const x = PAD.left + i * slot.value + (slot.value - barW.value) / 2
  const top = y(cents)
  const base = PAD.top + plotH
  const h = base - top
  if (h <= 0) return ''
  const bw = barW.value
  const r = Math.min(4, h, bw / 2)
  return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + bw - r}Q${x + bw},${top} ${x + bw},${top + r}V${base}Z`
}

const compact = (cents: number) =>
  new Intl.NumberFormat(locale.value === 'en' ? 'en-GB' : 'it-IT', { notation: 'compact', maximumFractionDigits: 1 }).format(cents / 100)

const active = ref<number | null>(null)
const tooltipStyle = computed(() => {
  if (active.value === null) return {}
  const xPct = ((PAD.left + active.value * slot.value + slot.value / 2) / W.value) * 100
  const yPct = (y(props.valuesCents[active.value] ?? 0) / H) * 100
  return { left: `${xPct}%`, top: `${yPct}%` }
})
const total = computed(() => props.valuesCents.reduce((a, b) => a + b, 0))
</script>

<template>
  <figure class="chart">
    <figcaption>
      <h2>{{ title }}</h2>
      <p class="muted">{{ t('dashboard.chartTotal', { total: fmt.euro(total) }) }}</p>
    </figcaption>
    <div ref="plotEl" class="plot" @mouseleave="active = null">
      <svg :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="t('dashboard.chartAria', { title, total: fmt.euro(total) })">
        <g class="grid">
          <g v-for="tick in scale.ticks" :key="tick">
            <line :x1="PAD.left" :x2="W - PAD.right" :y1="y(tick)" :y2="y(tick)" />
            <text :x="PAD.left - 8" :y="y(tick) + 4" text-anchor="end">{{ compact(tick) }}</text>
          </g>
        </g>
        <g v-for="(cents, i) in valuesCents" :key="i">
          <path v-if="cents > 0" class="bar" :class="{ dim: active !== null && active !== i }" :d="barPath(i, cents)" />
          <text class="month" :x="PAD.left + i * slot + slot / 2" :y="H - 8" text-anchor="middle">{{ months[i] }}</text>
          <!-- Hit target: the full column, larger than the bar. -->
          <rect
            class="hit"
            :x="PAD.left + i * slot"
            :y="PAD.top"
            :width="slot"
            :height="plotH"
            tabindex="0"
            :aria-label="`${months[i]} ${year}: ${fmt.euro(cents)}`"
            @mouseenter="active = i"
            @focus="active = i"
            @blur="active = null"
          />
        </g>
      </svg>
      <div v-if="active !== null" class="tooltip" :style="tooltipStyle" role="status">
        <strong>{{ months[active] }} {{ year }}</strong>
        <span>{{ fmt.euro(valuesCents[active] ?? 0) }}</span>
      </div>
    </div>
    <details>
      <summary>{{ t('dashboard.showTable') }}</summary>
      <table>
        <thead>
          <tr>
            <th scope="col">{{ t('dashboard.month') }}</th>
            <th scope="col" class="num">{{ t('dashboard.amount') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(cents, i) in valuesCents" :key="i">
            <td>{{ months[i] }} {{ year }}</td>
            <td class="num">{{ fmt.euro(cents) }}</td>
          </tr>
        </tbody>
      </table>
    </details>
  </figure>
</template>

<style scoped>
.chart {
  margin: 0;
}

figcaption h2 {
  font-size: 1rem;
  margin: 0;
}

figcaption p {
  margin: 2px 0 8px;
  font-size: 0.875rem;
}

.plot {
  position: relative;
}

svg {
  width: 100%;
  height: auto;
  display: block;
  overflow: visible;
}

.grid line {
  stroke: var(--border);
  stroke-width: 1;
}

.grid text,
.month {
  fill: var(--text-muted);
  font-size: 11px;
}

.bar {
  fill: var(--chart-1);
  transition: opacity 0.15s;
}

.bar.dim {
  opacity: 0.45;
}

.hit {
  fill: transparent;
  cursor: default;
}

.hit:focus-visible {
  outline: none;
  stroke: var(--focus);
  stroke-width: 2;
}

.tooltip {
  position: absolute;
  transform: translate(-50%, calc(-100% - 10px));
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 4px 14px rgb(0 0 0 / 12%);
  padding: 6px 10px;
  font-size: 0.85rem;
  display: flex;
  flex-direction: column;
  pointer-events: none;
  white-space: nowrap;
}

details {
  margin-top: 8px;
}

details summary {
  cursor: pointer;
  color: var(--text-muted);
  font-size: 0.875rem;
}

details table {
  margin-top: 8px;
}
</style>
