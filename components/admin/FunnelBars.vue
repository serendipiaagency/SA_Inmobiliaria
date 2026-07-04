<template>
  <div class="space-y-3">
    <div v-for="(row, i) in rows" :key="i">
      <div class="mb-1 flex items-baseline justify-between text-sm">
        <span class="font-medium text-stone-600">{{ row.stage }}</span>
        <span class="tabular-nums font-semibold text-ink">
          {{ format ? format(row.value) : row.value }}
          <span v-if="i > 0" class="ml-1 text-xs font-normal text-stone-400">{{ conv(i) }}%</span>
        </span>
      </div>
      <div class="h-2.5 w-full overflow-hidden rounded-full bg-stone-100">
        <div class="h-full rounded-full transition-all duration-700" :style="{ width: `${width(row.value)}%`, background: color }" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{ rows: { stage: string; value: number }[]; color?: string; format?: (v: number) => string }>(),
  { color: '#16150f' },
)
const max = computed(() => Math.max(...props.rows.map((r) => r.value), 1))
function width(v: number) {
  return Math.max(2, (v / max.value) * 100)
}
function conv(i: number) {
  const prev = props.rows[i - 1]?.value || 0
  if (!prev) return 0
  return Math.round((props.rows[i].value / prev) * 100)
}
</script>
