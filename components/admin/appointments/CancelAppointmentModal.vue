<template>
  <CommsModal title="Cancelar cita" :sub="subtitle" test-id="appointment-cancel" @close="emit('close')">
    <label class="block">
      <span class="mb-1 block text-[12px] font-medium text-stone-600">Motivo <span class="text-red-500">*</span></span>
      <input v-model="reason" list="cancel-reason-suggestions" class="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink" maxlength="500" placeholder="Por qué se cancela" data-testid="appointment-cancel-reason">
      <datalist id="cancel-reason-suggestions"><option v-for="r in CANCELLATION_REASON_SUGGESTIONS" :key="r" :value="r" /></datalist>
    </label>
    <div class="mt-2 flex flex-wrap gap-1">
      <button v-for="r in CANCELLATION_REASON_SUGGESTIONS" :key="r" type="button" class="rounded border border-line px-1.5 py-0.5 text-[11px] text-stone-500 hover:border-stone-400" @click="reason = r">{{ r }}</button>
    </div>
    <p class="mt-3 text-xs text-stone-500">La cita no se borra: queda cancelada con su motivo y se avisa al cliente.</p>
    <p v-if="error" class="mt-2 text-sm font-medium text-red-600">{{ error }}</p>
    <template #footer>
      <button type="button" class="rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-stone-600 hover:border-stone-400" @click="emit('close')">Volver</button>
      <button type="button" class="rounded-lg bg-red-600 px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50" :disabled="saving || !reason.trim()" data-testid="appointment-cancel-confirm" @click="confirm">
        {{ saving ? 'Cancelando…' : 'Cancelar la cita' }}
      </button>
    </template>
  </CommsModal>
</template>

<script setup lang="ts">
import CommsModal from '~/components/admin/comms/Modal.vue'
import { CANCELLATION_REASON_SUGGESTIONS } from '~/utils/appointmentCatalog'

/** Cancelar una cita exige motivo (FASE 17): PATCH /api/admin/saas/visits/:id con `status: 'cancelled'` y `cancellationReason`. */
const props = defineProps<{ appointment: { id: number; clientName?: string; scheduledAt?: string } }>()
const emit = defineEmits<{ close: []; cancelled: [id: number] }>()
const reason = ref('')
const saving = ref(false)
const error = ref('')
const subtitle = computed(() => [props.appointment.clientName, props.appointment.scheduledAt?.slice(0, 16)].filter(Boolean).join(' · '))

async function confirm() {
  if (!reason.value.trim()) return
  saving.value = true
  error.value = ''
  try {
    await $fetch(`/api/admin/saas/visits/${props.appointment.id}`, { method: 'PATCH', body: { status: 'cancelled', cancellationReason: reason.value.trim() } })
    emit('cancelled', props.appointment.id)
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'No se pudo cancelar la cita'
  } finally {
    saving.value = false
  }
}
</script>
