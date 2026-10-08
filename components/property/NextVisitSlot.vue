<template>
  <button v-if="state === 'slot' && slot" type="button" class="nv" data-testid="next-visit-slot" @click="emit('book', slot.start)">
    <span class="nv-icon" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16.5" rx="2" /><path d="M16 2.5v4M8 2.5v4M3 9.5h18" /></svg>
    </span>
    <span class="min-w-0 flex-1 text-left">
      <span class="block text-[12px] text-stone-500">{{ t('nextVisit.label', 'Próxima visita disponible') }}</span>
      <span class="block truncate text-[14px] font-semibold text-ink" data-testid="next-visit-when">{{ whenLabel }}</span>
    </span>
    <svg class="shrink-0 text-stone-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
  </button>
  <!-- Sin huecos (o sin agenda): pedir visita sin prometer una hora. -->
  <a v-else-if="state === 'none'" href="#contacto" class="nv" data-testid="next-visit-request">
    <span class="nv-icon" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16.5" rx="2" /><path d="M16 2.5v4M8 2.5v4M3 9.5h18" /></svg>
    </span>
    <span class="min-w-0 flex-1 text-left">
      <span class="block text-[14px] font-semibold text-ink">{{ t('nextVisit.request', 'Solicitar visita') }}</span>
      <span class="block text-[12px] text-stone-500">{{ t('nextVisit.requestHint', 'Te proponemos una hora') }}</span>
    </span>
  </a>
</template>

<script setup lang="ts">
/**
 * «Próxima visita disponible» (#110): el primer hueco libre REAL de la agenda
 * del comercial responsable (la misma disponibilidad que la reserva: horario,
 * duración, citas, bloqueos y tope diario, en la zona de su agenda). Pulsarlo
 * abre la reserva con esa hora ya elegida. Sin comercial con agenda o sin
 * huecos en dos semanas, «Solicitar visita» lleva al formulario, sin prometer
 * ninguna hora.
 */
const props = defineProps<{ agentSlug?: string | null }>()
const emit = defineEmits<{ book: [start: string] }>()
const { t } = useI18n()

const state = ref<'loading' | 'slot' | 'none'>('loading')
const slot = ref<{ start: string; end: string } | null>(null)

onMounted(async () => {
  if (!props.agentSlug) {
    state.value = 'none'
    return
  }
  try {
    const res = await $fetch<{ days: { date: string; slots: { start: string; end: string }[] }[] }>(`/api/public/agents/${props.agentSlug}/availability`, { query: { days: 14 } })
    slot.value = res.days.flatMap((d) => d.slots)[0] || null
    state.value = slot.value ? 'slot' : 'none'
  } catch {
    state.value = 'none'
  }
})

// «Sábado, 11 oct · 10:00 - 10:30» (hora de pared de la agenda, sin convertir).
const whenLabel = computed(() => {
  if (!slot.value) return ''
  const d = new Date(`${slot.value.start.slice(0, 10)}T00:00:00Z`)
  const day = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${slot.value.start.slice(11, 16)} - ${slot.value.end.slice(11, 16)}`
})
</script>

<style scoped>
.nv {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 12px;
  border-radius: 12px;
  background: #fbefe4;
  padding: 10px 12px;
  transition: background 0.15s;
}
.nv:hover {
  background: #f8e5d4;
}
.nv-icon {
  display: inline-flex;
  height: 38px;
  width: 38px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: #1f3a30;
  color: #fff;
}
</style>
