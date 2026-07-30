<template>
  <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="cls">{{ label }}</span>
</template>

<script setup lang="ts">
const props = defineProps<{ status: string }>()

const LABELS: Record<string, string> = {
  scheduled: 'Programada',
  in_progress: 'En curso',
  completed: 'Completada',
  cancelled: 'Cancelada',
  pending: 'Pendiente',
  running: 'Ejecutando',
  success: 'Publicado',
  failed: 'Fallido',
  paused: 'Pausado',
  retrying: 'Reintentando',
}

const CLASSES: Record<string, string> = {
  scheduled: 'bg-blue-50 text-blue-700',
  in_progress: 'bg-amber-50 text-amber-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-stone-100 text-stone-500',
  pending: 'bg-blue-50 text-blue-700',
  running: 'bg-amber-50 text-amber-700',
  success: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-red-50 text-red-700',
  paused: 'bg-stone-100 text-stone-500',
  retrying: 'bg-amber-50 text-amber-700',
}

const label = computed(() => LABELS[props.status] || props.status)
const cls = computed(() => CLASSES[props.status] || 'bg-stone-100 text-stone-500')
</script>
