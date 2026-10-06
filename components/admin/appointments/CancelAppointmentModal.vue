<template>
  <CommsModal :title="tourId ? 'Quitar parada del tour' : 'Cancelar cita'" :sub="subtitle" :test-id="tourId ? 'tour-remove-stop' : 'appointment-cancel'" @close="emit('close')">
    <label class="block">
      <span class="mb-1 block text-[12px] font-medium text-stone-600">Motivo <span class="text-red-500">*</span></span>
      <input v-model="reason" list="cancel-reason-suggestions" class="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink" maxlength="500" :placeholder="tourId ? 'Por qué se quita de la ruta' : 'Por qué se cancela'" data-testid="appointment-cancel-reason">
      <datalist id="cancel-reason-suggestions"><option v-for="r in CANCELLATION_REASON_SUGGESTIONS" :key="r" :value="r" /></datalist>
    </label>
    <div class="mt-2 flex flex-wrap gap-1">
      <button v-for="r in CANCELLATION_REASON_SUGGESTIONS" :key="r" type="button" class="rounded border border-line px-1.5 py-0.5 text-[11px] text-stone-500 hover:border-stone-400" @click="reason = r">{{ r }}</button>
    </div>
    <p class="mt-3 text-xs text-stone-500">
      <template v-if="tourId">La parada no se borra: su cita queda cancelada con este motivo, sigue en el tour como cancelada y se avisa al cliente. El resto de la ruta no se mueve.</template>
      <template v-else>La cita no se borra: queda cancelada con su motivo y se avisa al cliente.</template>
    </p>
    <p v-if="error" class="mt-2 text-sm font-medium text-red-600" data-testid="appointment-cancel-error">{{ error }}</p>
    <template #footer>
      <button type="button" class="rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-stone-600 hover:border-stone-400" @click="emit('close')">Volver</button>
      <button type="button" class="rounded-lg bg-red-600 px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50" :disabled="saving || !reason.trim()" data-testid="appointment-cancel-confirm" @click="confirm">
        {{ saving ? (tourId ? 'Quitando…' : 'Cancelando…') : tourId ? 'Quitar la parada' : 'Cancelar la cita' }}
      </button>
    </template>
  </CommsModal>
</template>

<script setup lang="ts">
import CommsModal from '~/components/admin/comms/Modal.vue'
import { CANCELLATION_REASON_SUGGESTIONS } from '~/utils/appointmentCatalog'

/**
 * Cancelar una cita exige motivo (FASE 17): PATCH /api/admin/saas/visits/:id
 * con `status: 'cancelled'` y `cancellationReason`. Con `tourId` es «Quitar
 * parada» de un tour ya creado (FASE 18): POST /api/admin/saas/tours con
 * `action: 'remove_stop'` — el mismo efecto sobre la cita, más la regla de
 * que un tour no se queda sin paradas activas (el servidor lo comprueba).
 */
const props = defineProps<{ appointment: { id: number; clientName?: string; scheduledAt?: string; propertyName?: string | null }; tourId?: number | null }>()
const emit = defineEmits<{ close: []; cancelled: [id: number] }>()
const reason = ref('')
const saving = ref(false)
const error = ref('')
const subtitle = computed(() => [props.tourId ? props.appointment.propertyName : props.appointment.clientName, props.appointment.scheduledAt?.slice(0, 16)].filter(Boolean).join(' · '))

async function confirm() {
  if (!reason.value.trim()) return
  saving.value = true
  error.value = ''
  try {
    if (props.tourId) {
      await $fetch('/api/admin/saas/tours', { method: 'POST', body: { action: 'remove_stop', tourId: props.tourId, stopId: props.appointment.id, reason: reason.value.trim() } })
    } else {
      await $fetch(`/api/admin/saas/visits/${props.appointment.id}`, { method: 'PATCH', body: { status: 'cancelled', cancellationReason: reason.value.trim() } })
    }
    emit('cancelled', props.appointment.id)
  } catch (e: any) {
    error.value = e?.data?.statusMessage || (props.tourId ? 'No se pudo quitar la parada' : 'No se pudo cancelar la cita')
  } finally {
    saving.value = false
  }
}
</script>
