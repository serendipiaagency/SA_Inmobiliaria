<template>
  <div class="group relative rounded-xl border border-line bg-white p-5 transition hover:shadow-[0_2px_20px_-8px_rgba(0,0,0,0.15)]">
    <div class="flex items-start justify-between">
      <div>
        <p class="text-[11px] font-semibold uppercase tracking-widest text-stone-450">{{ label }}</p>
        <p class="mt-2 text-[26px] font-semibold leading-none tracking-tight text-ink">{{ value }}</p>
      </div>
      <span
        v-if="delta !== undefined && delta !== null"
        class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
        :class="delta >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'"
      >
        <svg class="h-3 w-3" viewBox="0 0 12 12" fill="none" :class="delta >= 0 ? '' : 'rotate-180'">
          <path d="M6 2.5v7M6 2.5 3 5.5M6 2.5 9 5.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        {{ Math.abs(delta) }}%
      </span>
    </div>
    <div v-if="spark && spark.length" class="mt-3 h-9">
      <AdminSparkline :values="spark" :w="220" :h="36" :color="delta !== undefined && delta < 0 ? '#e11d48' : '#16150f'" class="w-full" />
    </div>
    <p v-if="sub" class="mt-2 text-xs text-stone-500">{{ sub }}</p>
  </div>
</template>

<script setup lang="ts">
defineProps<{ label: string; value: string; delta?: number | null; spark?: number[]; sub?: string }>()
</script>
