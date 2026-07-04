<template>
  <svg :viewBox="`0 0 ${w} ${h}`" :width="w" :height="h" preserveAspectRatio="none" class="overflow-visible">
    <defs>
      <linearGradient :id="gid" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" :stop-color="color" stop-opacity="0.22" />
        <stop offset="100%" :stop-color="color" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path :d="area" :fill="`url(#${gid})`" />
    <path :d="line" fill="none" :stroke="color" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" />
  </svg>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{ values: number[]; w?: number; h?: number; color?: string }>(), {
  w: 120,
  h: 36,
  color: '#16150f',
})
const gid = `sl${Math.round((props.values.reduce((a, b) => a + b, 0) % 99999) + props.w * 7 + props.h)}`

const pts = computed(() => {
  const v = props.values.length ? props.values : [0, 0]
  const min = Math.min(...v)
  const max = Math.max(...v)
  const span = max - min || 1
  const step = props.w / (v.length - 1 || 1)
  return v.map((val, i) => [i * step, props.h - ((val - min) / span) * (props.h - 4) - 2])
})
const line = computed(() => pts.value.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '))
const area = computed(() => `${line.value} L${props.w},${props.h} L0,${props.h} Z`)
</script>
