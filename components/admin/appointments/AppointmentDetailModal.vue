<template>
  <CommsModal :title="row?.clientName || 'Cita'" :sub="row ? `${appointmentTypeLabel(row.type)} · ${appointmentChannelLabel(row.channel)}` : 'Cargando…'" wide test-id="appointment-detail" @close="emit('close')">
    <p v-if="loadError" class="text-sm text-red-600">{{ loadError }}</p>
    <div v-else-if="row" class="space-y-4 text-sm">
      <div class="flex flex-wrap items-center gap-2">
        <AdminStatusPill :status="row.status" />
        <span class="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-600" data-testid="appointment-detail-confirmation">{{ confirmationLabel(row.confirmationStatus) }}</span>
        <span v-if="row.tourId" class="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-600">🧭 Parada {{ (row.tourStopOrder ?? 0) + 1 }} de un tour</span>
      </div>

      <dl class="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <div><dt class="ad-dt">Cuándo</dt><dd>{{ when }}</dd></div>
        <div><dt class="ad-dt">Zona horaria</dt><dd>{{ row.timezone || 'La de la oficina o la agencia' }}</dd></div>
        <div><dt class="ad-dt">Comercial</dt><dd><NuxtLink v-if="row.agentId" :to="`/admin/comerciales/${row.agentId}`" class="hover:underline">{{ row.agentName }}</NuxtLink><span v-else>—</span></dd></div>
        <div><dt class="ad-dt">Oficina</dt><dd>{{ row.officeName || row.office || '—' }}</dd></div>
        <div><dt class="ad-dt">Contacto</dt><dd><NuxtLink v-if="row.contactId" :to="`/admin/contactos/${row.contactId}`" class="hover:underline">{{ row.contactName || `#${row.contactId}` }}</NuxtLink><span v-else>—</span></dd></div>
        <div><dt class="ad-dt">Lead</dt><dd><NuxtLink v-if="row.leadId" :to="`/admin/leads/${row.leadId}`" class="hover:underline">{{ row.leadName || `#${row.leadId}` }}</NuxtLink><span v-else>—</span></dd></div>
        <div><dt class="ad-dt">Cliente</dt><dd>{{ [row.clientEmail, row.clientPhone].filter(Boolean).join(' · ') || '—' }}</dd></div>
        <div><dt class="ad-dt">Inmueble</dt><dd>{{ row.propertyName || '—' }}<span v-if="row.propertyKind" class="text-xs text-stone-400"> · {{ row.propertyKind === 'agent' ? '2ª mano' : 'obra nueva' }}</span></dd></div>
        <div><dt class="ad-dt">Punto de encuentro</dt><dd>{{ row.meetingPoint || '—' }}</dd></div>
        <div><dt class="ad-dt">Recordatorios</dt><dd data-testid="appointment-detail-reminder">{{ reminderSummary(row) }}</dd></div>
        <div v-if="row.videoLink" class="sm:col-span-2"><dt class="ad-dt">Videollamada</dt><dd><a :href="row.videoLink" target="_blank" rel="noopener" class="text-blue-700 hover:underline">{{ row.videoLink }}</a></dd></div>
        <div v-if="row.notes" class="sm:col-span-2"><dt class="ad-dt">Notas</dt><dd class="whitespace-pre-line">{{ row.notes }}</dd></div>
        <div v-if="row.internalNotes" class="sm:col-span-2"><dt class="ad-dt">Notas internas</dt><dd class="whitespace-pre-line">{{ row.internalNotes }}</dd></div>
        <div v-if="row.status === 'cancelled'" class="sm:col-span-2"><dt class="ad-dt">Motivo de la cancelación</dt><dd data-testid="appointment-detail-cancel-reason">{{ row.cancellationReason || 'Sin motivo (cancelada antes de que fuera obligatorio)' }}</dd></div>
      </dl>

      <div v-if="row.outcome" class="rounded-lg border border-line bg-stone-50/60 p-3">
        <p class="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-400">Resultado de la visita</p>
        <OutcomeSummary :v="row" />
        <p v-if="row.outcomeLiked" class="mt-2"><span class="text-stone-400">Le gustó:</span> {{ row.outcomeLiked }}</p>
        <p v-if="row.outcomeDisliked"><span class="text-stone-400">No le gustó:</span> {{ row.outcomeDisliked }}</p>
        <p v-if="row.outcomeNotes" class="whitespace-pre-line"><span class="text-stone-400">Notas:</span> {{ row.outcomeNotes }}</p>
      </div>
      <OutcomeSummary v-else-if="row.offers?.length" :v="row" />

      <!-- Campos personalizados de la cita (FASE 0, bloque N7b). -->
      <div class="rounded-lg border border-line p-3">
        <p class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-400">Campos personalizados</p>
        <CustomFieldsPanel entity-type="appointment" :entity-id="row.id" :can-edit="canWrite('crm')" compact />
      </div>

      <p v-if="actionError" class="text-sm font-medium text-red-600">{{ actionError }}</p>
    </div>
    <template v-if="row" #footer>
      <div class="flex w-full flex-wrap justify-end gap-1.5">
        <button v-if="row.status === 'scheduled' && resizable" type="button" class="btn-quiet !px-2.5 !py-1 text-xs" @click="resize(-15)">-15 min</button>
        <button v-if="row.status === 'scheduled' && resizable" type="button" class="btn-quiet !px-2.5 !py-1 text-xs" @click="resize(15)">+15 min</button>
        <button v-if="row.status === 'scheduled' && row.confirmationStatus === 'pending'" type="button" class="btn-quiet !px-2.5 !py-1 text-xs" data-testid="appointment-detail-confirm" @click="patch({ confirmationStatus: 'confirmed_internal' }, 'Confirmada por la agencia')">Confirmar</button>
        <button v-if="row.status === 'scheduled'" type="button" class="btn-quiet !px-2.5 !py-1 text-xs" @click="patch({ status: 'completed' }, 'Marcada como completada')">Completada</button>
        <button v-if="row.status === 'scheduled'" type="button" class="btn-quiet !px-2.5 !py-1 text-xs" @click="patch({ status: 'no_show' }, 'Marcada como no asistida')">No asistió</button>
        <button v-if="row.status === 'scheduled'" type="button" class="btn-quiet !px-2.5 !py-1 text-xs text-red-600" data-testid="appointment-detail-cancel" @click="emit('cancel', row)">Cancelar</button>
        <button v-if="row.status === 'completed'" type="button" class="btn-quiet !px-2.5 !py-1 text-xs" data-testid="appointment-detail-outcome" @click="emit('outcome', row)">{{ row.outcome ? 'Editar resultado' : 'Anotar resultado' }}</button>
        <button type="button" class="btn-quiet !px-2.5 !py-1 text-xs" data-testid="appointment-detail-edit" @click="emit('edit', row)">Editar</button>
      </div>
    </template>
  </CommsModal>
</template>

<script setup lang="ts">
import CommsModal from '~/components/admin/comms/Modal.vue'
import AdminStatusPill from '~/components/admin/StatusPill.vue'
import OutcomeSummary from '~/components/admin/appointments/OutcomeSummary.vue'
import CustomFieldsPanel from '~/components/admin/custom-fields/CustomFieldsPanel.vue'
import { appointmentChannelLabel, appointmentTypeLabel, confirmationLabel, reminderSummary } from '~/utils/appointmentCatalog'

/**
 * Ficha de una cita (FASES 17-19): todos sus campos, el resultado
 * estructurado y las ofertas, con las acciones rápidas. Lee
 * GET /api/admin/saas/visits?id=… (la cita sólo existe para su agencia).
 */
const props = withDefaults(defineProps<{ id: number; resizable?: boolean; refreshKey?: number }>(), { resizable: false, refreshKey: 0 })
const emit = defineEmits<{ close: []; edit: [row: any]; outcome: [row: any]; cancel: [row: any]; changed: [] }>()
const toast = useToast()
const dt = useDash()
const { canWrite } = useAdminPermissions()

const row = ref<any>(null)
const loadError = ref('')
const actionError = ref('')
async function load() {
  try {
    row.value = (await $fetch<{ row: any }>('/api/admin/saas/visits', { query: { id: props.id } })).row
  } catch (e: any) {
    loadError.value = e?.data?.statusMessage || 'No se pudo cargar la cita'
  }
}
onMounted(load)
watch(() => props.refreshKey, load)

const when = computed(() => {
  if (!row.value) return ''
  const end = row.value.endsAt ? ` – ${row.value.endsAt.slice(0, 10) === row.value.scheduledAt.slice(0, 10) ? row.value.endsAt.slice(11, 16) : dt.dateTime(row.value.endsAt)}` : ''
  return `${dt.dateTime(row.value.scheduledAt)}${end}${row.value.durationMinutes ? ` (${row.value.durationMinutes} min)` : ''}`
})

async function patch(body: Record<string, any>, ok: string) {
  actionError.value = ''
  try {
    await $fetch(`/api/admin/saas/visits/${props.id}`, { method: 'PATCH', body })
    toast.success(ok)
    await load()
    emit('changed')
  } catch (e: any) {
    actionError.value = e?.data?.statusMessage || 'No se pudo actualizar la cita'
  }
}
function resize(delta: number) {
  const current = row.value.endsAt ? Math.round((Date.parse(`${row.value.endsAt.replace(' ', 'T')}Z`) - Date.parse(`${row.value.scheduledAt.replace(' ', 'T')}Z`)) / 60000) : row.value.durationMinutes || 60
  patch({ durationMinutes: Math.max(15, current + delta) }, 'Duración actualizada')
}
</script>

<style scoped>
.ad-dt {
  @apply text-[11px] font-semibold uppercase tracking-wide text-stone-400;
}
</style>
