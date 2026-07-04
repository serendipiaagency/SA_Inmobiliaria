<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize"
    :class="cls"
  >
    <span class="h-1.5 w-1.5 rounded-full" :style="{ background: dot }" />
    {{ text }}
  </span>
</template>

<script setup lang="ts">
const props = defineProps<{ status: string }>()

const MAP: Record<string, { cls: string; dot: string; text: string }> = {
  // leads
  new: { cls: 'border-blue-200 bg-blue-50 text-blue-700', dot: '#2563eb', text: 'Nuevo' },
  contacted: { cls: 'border-violet-200 bg-violet-50 text-violet-700', dot: '#7c3aed', text: 'Contactado' },
  qualified: { cls: 'border-amber-200 bg-amber-50 text-amber-700', dot: '#d97706', text: 'Cualificado' },
  proposal: { cls: 'border-orange-200 bg-orange-50 text-orange-700', dot: '#ea580c', text: 'Propuesta' },
  won: { cls: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: '#059669', text: 'Ganado' },
  lost: { cls: 'border-stone-200 bg-stone-100 text-stone-500', dot: '#a8a29e', text: 'Perdido' },
  // visits / reservations
  scheduled: { cls: 'border-blue-200 bg-blue-50 text-blue-700', dot: '#2563eb', text: 'Agendada' },
  completed: { cls: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: '#059669', text: 'Completada' },
  cancelled: { cls: 'border-rose-200 bg-rose-50 text-rose-600', dot: '#e11d48', text: 'Cancelada' },
  no_show: { cls: 'border-stone-200 bg-stone-100 text-stone-500', dot: '#a8a29e', text: 'No asistió' },
  pending: { cls: 'border-amber-200 bg-amber-50 text-amber-700', dot: '#d97706', text: 'Pendiente' },
  confirmed: { cls: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: '#059669', text: 'Confirmada' },
  // invoices
  paid: { cls: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: '#059669', text: 'Pagada' },
  overdue: { cls: 'border-rose-200 bg-rose-50 text-rose-600', dot: '#e11d48', text: 'Vencida' },
  draft: { cls: 'border-stone-200 bg-stone-100 text-stone-500', dot: '#a8a29e', text: 'Borrador' },
  void: { cls: 'border-stone-200 bg-stone-100 text-stone-400', dot: '#a8a29e', text: 'Anulada' },
  // client stage
  active: { cls: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: '#059669', text: 'Activo' },
  inactive: { cls: 'border-stone-200 bg-stone-100 text-stone-500', dot: '#a8a29e', text: 'Inactivo' },
  closed: { cls: 'border-blue-200 bg-blue-50 text-blue-700', dot: '#2563eb', text: 'Cerrado' },
}
const fallback = { cls: 'border-stone-200 bg-stone-100 text-stone-600', dot: '#a8a29e', text: props.status }
const entry = computed(() => MAP[props.status] || fallback)
const cls = computed(() => entry.value.cls)
const dot = computed(() => entry.value.dot)
const text = computed(() => entry.value.text)
</script>
