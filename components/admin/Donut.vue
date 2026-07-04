<template>
  <div class="flex items-center gap-5">
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" class="shrink-0 -rotate-90">
      <circle :cx="size / 2" :cy="size / 2" :r="r" fill="none" stroke="#f1efe9" :stroke-width="stroke" />
      <circle
        v-for="(seg, i) in segments"
        :key="i"
        :cx="size / 2"
        :cy="size / 2"
        :r="r"
        fill="none"
        :stroke="seg.color"
        :stroke-width="stroke"
        :stroke-dasharray="`${seg.len} ${circ - seg.len}`"
        :stroke-dashoffset="-seg.offset"
        stroke-linecap="butt"
      />
    </svg>
    <div class="min-w-0 flex-1 space-y-1.5">
      <div v-for="(seg, i) in segments" :key="i" class="flex items-center justify-between gap-3 text-sm">
        <span class="flex min-w-0 items-center gap-2">
          <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ background: seg.color }" />
          <span class="truncate capitalize text-stone-600">{{ seg.label }}</span>
        </span>
        <span class="shrink-0 font-semibold text-ink">{{ seg.value }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{ data: { label: string; value: number }[]; size?: number }>(), { size: 132 })
const stroke = 16
const r = computed(() => props.size / 2 - stroke / 2)
const circ = computed(() => 2 * Math.PI * r.value)
const palette = ['#16150f', '#8a867e', '#c2703d', '#6b8f71', '#4a6fa5', '#b0463f']

const segments = computed(() => {
  const total = props.data.reduce((a, d) => a + d.value, 0) || 1
  let offset = 0
  return props.data.map((d, i) => {
    const len = (d.value / total) * circ.value
    const seg = { label: d.label, value: d.value, color: palette[i % palette.length], len, offset }
    offset += len
    return seg
  })
})
</script>
