<template>
  <div class="relative w-full" :style="{ height: `${h}px` }" @mousemove="onMove" @mouseleave="hover = null">
    <svg :viewBox="`0 0 ${w} ${h}`" preserveAspectRatio="none" class="h-full w-full">
      <defs>
        <linearGradient :id="gid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" :stop-color="color" stop-opacity="0.18" />
          <stop offset="100%" :stop-color="color" stop-opacity="0" />
        </linearGradient>
      </defs>
      <!-- gridlines -->
      <line v-for="g in 4" :key="g" :x1="0" :x2="w" :y1="(h / 4) * g" :y2="(h / 4) * g" stroke="#f1efe9" stroke-width="1" />
      <path :d="area" :fill="`url(#${gid})`" />
      <path :d="line" fill="none" :stroke="color" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      <g v-if="hover !== null">
        <line :x1="pts[hover][0]" :x2="pts[hover][0]" y1="0" :y2="h" stroke="#d6d3cc" stroke-width="1" stroke-dasharray="3 3" />
        <circle :cx="pts[hover][0]" :cy="pts[hover][1]" r="3.5" :fill="color" stroke="#fff" stroke-width="1.5" />
      </g>
    </svg>
    <div
      v-if="hover !== null"
      class="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-line bg-white px-2.5 py-1.5 text-center shadow-lg"
      :style="{ left: `${(pts[hover][0] / w) * 100}%`, top: '4px' }"
    >
      <p class="text-[10px] uppercase tracking-wide text-stone-400">{{ labels[hover] }}</p>
      <p class="text-xs font-semibold text-ink">{{ formatted[hover] }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{ values: number[]; labels?: string[]; w?: number; h?: number; color?: string; format?: (v: number) => string }>(),
  { w: 640, h: 200, color: '#16150f' },
)
const gid = `ac${props.w}${props.h}${Math.round(props.values.reduce((a, b) => a + b, 0) % 9999)}`
const hover = ref<number | null>(null)

const pts = computed(() => {
  const v = props.values.length ? props.values : [0, 0]
  const max = Math.max(...v, 1)
  const min = Math.min(...v, 0)
  const span = max - min || 1
  const step = props.w / (v.length - 1 || 1)
  return v.map((val, i) => [i * step, props.h - ((val - min) / span) * (props.h - 16) - 8])
})
const line = computed(() => pts.value.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '))
const area = computed(() => `${line.value} L${props.w},${props.h} L0,${props.h} Z`)
const labels = computed(() => props.labels || props.values.map((_, i) => String(i)))
const formatted = computed(() => props.values.map((v) => (props.format ? props.format(v) : String(v))))

function onMove(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const x = ((e.clientX - rect.left) / rect.width) * props.w
  const step = props.w / (props.values.length - 1 || 1)
  hover.value = Math.min(props.values.length - 1, Math.max(0, Math.round(x / step)))
}
</script>
