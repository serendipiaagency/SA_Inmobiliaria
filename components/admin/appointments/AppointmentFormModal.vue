<template>
  <CommsModal :title="isEdit ? 'Editar cita' : 'Nueva cita'" :sub="isEdit ? 'Todos los campos de la cita. Mover la hora o el comercial vuelve a comprobar su agenda y avisa al cliente.' : 'Cita suelta en la agenda de un comercial. Se comprueba que no tenga otra a esa hora.'" wide test-id="appointment-form" @close="emit('close')">
    <form class="space-y-5" @submit.prevent="save">
      <section>
        <p class="af-section">Qué y cuándo</p>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="af-label">Tipo</span>
            <select v-model="form.type" class="af-input" data-testid="appointment-form-type">
              <option v-for="t in APPOINTMENT_TYPES" :key="t" :value="t">{{ APPOINTMENT_TYPE_LABELS[t] }}</option>
            </select>
          </label>
          <label class="block">
            <span class="af-label">Canal</span>
            <select v-model="form.channel" class="af-input" :disabled="form.type === 'video_call'" data-testid="appointment-form-channel">
              <option value="">Según el tipo ({{ APPOINTMENT_CHANNEL_LABELS[defaultChannelFor(form.type)] }})</option>
              <option v-for="c in APPOINTMENT_CHANNELS" :key="c" :value="c">{{ APPOINTMENT_CHANNEL_LABELS[c] }}</option>
            </select>
          </label>
          <label class="block">
            <span class="af-label">Inicio <span class="text-red-500">*</span></span>
            <input v-model="form.scheduledAt" type="datetime-local" class="af-input" required data-testid="appointment-form-start" @change="keepEndAfterStart">
          </label>
          <label class="block">
            <span class="af-label">Fin</span>
            <input v-model="form.endsAt" type="datetime-local" class="af-input" data-testid="appointment-form-end">
            <span class="mt-1 flex flex-wrap gap-1">
              <button v-for="m in [30, 45, 60, 90, 120]" :key="m" type="button" class="rounded border border-line px-1.5 py-0.5 text-[11px] text-stone-500 hover:border-stone-400" @click="setDuration(m)">{{ m }} min</button>
            </span>
            <span class="mt-1 block text-[11px] text-stone-400">{{ durationHint }}</span>
          </label>
          <label class="block sm:col-span-2">
            <span class="af-label">Zona horaria</span>
            <input v-model="form.timezone" list="appointment-timezones" class="af-input" placeholder="Vacío = la de la oficina o la de la agencia" data-testid="appointment-form-timezone">
            <datalist id="appointment-timezones"><option v-for="tz in COMMON_TIMEZONES" :key="tz" :value="tz" /></datalist>
            <span class="mt-1 block text-[11px] text-stone-400">Las horas son las del reloj de esa zona; la exportación iCal las convierte a la hora real.</span>
          </label>
        </div>
      </section>

      <section>
        <p class="af-section">Con quién</p>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="af-label">Comercial <span class="text-red-500">*</span></span>
            <select v-model="form.agentId" class="af-input" data-testid="appointment-form-agent">
              <option :value="null">Elegir…</option>
              <option v-for="ag in agents" :key="ag.id" :value="ag.id">{{ ag.name }}</option>
            </select>
          </label>
          <label class="block">
            <span class="af-label">Oficina</span>
            <select v-model="form.officeId" class="af-input" data-testid="appointment-form-office">
              <option :value="null">{{ isEdit ? 'Sin oficina' : 'La del comercial' }}</option>
              <option v-for="o in offices" :key="o.id" :value="o.id">{{ o.label }}</option>
            </select>
          </label>
          <div class="block">
            <span class="af-label">Contacto (cliente)</span>
            <EntityPicker v-model="contact" kind="contact" placeholder="Buscar contacto…" test-id="appointment-form-contact" />
          </div>
          <div class="block">
            <span class="af-label">Lead</span>
            <EntityPicker v-model="lead" kind="lead" placeholder="Buscar lead…" test-id="appointment-form-lead" />
          </div>
          <label class="block sm:col-span-2">
            <span class="af-label">Nombre del cliente o título <span v-if="!contact && !lead" class="text-red-500">*</span></span>
            <input v-model="form.clientName" class="af-input" :placeholder="contact || lead ? 'Vacío = el del contacto o el lead' : 'Ej. Marta Ruiz · Open house ático'" data-testid="appointment-form-client-name">
          </label>
          <label class="block">
            <span class="af-label">Email</span>
            <input v-model="form.clientEmail" type="email" class="af-input" data-testid="appointment-form-client-email">
          </label>
          <label class="block">
            <span class="af-label">Teléfono</span>
            <input v-model="form.clientPhone" type="tel" class="af-input" data-testid="appointment-form-client-phone">
          </label>
          <p v-if="CLIENT_FACING_TYPES.includes(form.type)" class="text-[11px] text-stone-400 sm:col-span-2">Una {{ APPOINTMENT_TYPE_LABELS[form.type].toLowerCase() }} necesita un email o un teléfono (propios o del contacto/lead) para avisar y recordar la cita al cliente.</p>
        </div>
      </section>

      <section>
        <p class="af-section">Dónde</p>
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="block">
            <span class="af-label">Inmueble</span>
            <EntityPicker v-model="property" kind="property" placeholder="Buscar en obra nueva y 2ª mano…" test-id="appointment-form-property" />
          </div>
          <label class="block">
            <span class="af-label">Punto de encuentro</span>
            <input v-model="form.meetingPoint" class="af-input" maxlength="300" placeholder="Ej. portal del edificio, oficina…" data-testid="appointment-form-meeting-point">
          </label>
        </div>
      </section>

      <section>
        <p class="af-section">Notas</p>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="af-label">Notas de la cita</span>
            <textarea v-model="form.notes" rows="3" class="af-input" data-testid="appointment-form-notes" />
          </label>
          <label class="block">
            <span class="af-label">Notas internas <span class="font-normal text-stone-400">(sólo el equipo)</span></span>
            <textarea v-model="form.internalNotes" rows="3" class="af-input" data-testid="appointment-form-internal-notes" />
          </label>
        </div>
      </section>

      <section>
        <p class="af-section">Estado</p>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="af-label">Confirmación</span>
            <select v-model="form.confirmationStatus" class="af-input" data-testid="appointment-form-confirmation">
              <option value="pending">{{ CONFIRMATION_STATUS_LABELS.pending }}</option>
              <option value="confirmed_internal">{{ CONFIRMATION_STATUS_LABELS.confirmed_internal }}</option>
              <option v-if="original.confirmationStatus === 'confirmed'" value="confirmed" disabled>{{ CONFIRMATION_STATUS_LABELS.confirmed }}</option>
            </select>
            <span class="mt-1 block text-[11px] text-stone-400">La del cliente la da él desde su enlace de gestión; aquí se anota la que confirmáis vosotros (por teléfono, WhatsApp…).</span>
          </label>
          <label v-if="isEdit" class="block">
            <span class="af-label">Estado de la cita</span>
            <select v-model="form.status" class="af-input" data-testid="appointment-form-status">
              <option v-for="s in APPOINTMENT_STATUSES" :key="s" :value="s">{{ APPOINTMENT_STATUS_LABELS[s] }}</option>
            </select>
          </label>
          <label v-if="isEdit && form.status === 'cancelled'" class="block sm:col-span-2">
            <span class="af-label">Motivo de la cancelación <span class="text-red-500">*</span></span>
            <input v-model="form.cancellationReason" list="appointment-cancel-reasons" class="af-input" maxlength="500" data-testid="appointment-form-cancel-reason">
            <datalist id="appointment-cancel-reasons"><option v-for="r in CANCELLATION_REASON_SUGGESTIONS" :key="r" :value="r" /></datalist>
          </label>
          <p v-if="isEdit" class="text-xs text-stone-500 sm:col-span-2">Recordatorios: {{ reminderSummary(appointment || {}) }}</p>
        </div>
      </section>

      <p v-if="error" class="text-sm font-medium text-red-600" data-testid="appointment-form-error">{{ error }}</p>
    </form>
    <template #footer>
      <button type="button" class="rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-stone-600 hover:border-stone-400" @click="emit('close')">Cancelar</button>
      <button type="button" class="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50" :disabled="saving" data-testid="appointment-form-save" @click="save">
        {{ saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear cita' }}
      </button>
    </template>
  </CommsModal>
</template>

<script setup lang="ts">
import CommsModal from '~/components/admin/comms/Modal.vue'
import EntityPicker from '~/components/admin/appointments/EntityPicker.vue'
import { loadRelationOptions, type RelationOption } from '~/composables/useRelationOptions'
import {
  APPOINTMENT_CHANNELS,
  APPOINTMENT_CHANNEL_LABELS,
  APPOINTMENT_STATUSES,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_TYPES,
  APPOINTMENT_TYPE_LABELS,
  CANCELLATION_REASON_SUGGESTIONS,
  CLIENT_FACING_TYPES,
  COMMON_TIMEZONES,
  CONFIRMATION_STATUS_LABELS,
  defaultChannelFor,
  reminderSummary,
  type PickedEntity,
} from '~/utils/appointmentCatalog'

/**
 * Alta y edición de una cita (FASE 17) con todos sus campos. Alta con
 * POST /api/admin/saas/visits; edición con PATCH /api/admin/saas/visits/:id
 * enviando sólo lo que ha cambiado. El servidor (server/utils/appointments/*)
 * vuelve a validarlo todo: catálogo de tipos, zona horaria, inicio y fin,
 * que comercial, oficina, contacto, lead e inmueble sean de la agencia, la
 * papelera y los solapes.
 */
const props = defineProps<{
  appointment?: Record<string, any> | null
  defaults?: { scheduledAt?: string; agentId?: number | null; type?: string } | null
  agents: Array<{ id: number; name: string; slotDurationMinutes?: number }>
}>()
const emit = defineEmits<{ close: []; saved: [id: number] }>()

const isEdit = computed(() => !!props.appointment?.id)
const a: Record<string, any> = props.appointment || {}
const toLocal = (s?: string | null) => (s ? s.slice(0, 16).replace(' ', 'T') : '')
const toServer = (s: string) => `${s.replace('T', ' ')}:00`

const original = {
  type: a.type || props.defaults?.type || 'property_viewing',
  channel: a.channel || '',
  clientName: a.clientName || '',
  clientEmail: a.clientEmail || '',
  clientPhone: a.clientPhone || '',
  agentId: (a.agentId ?? props.defaults?.agentId ?? null) as number | null,
  officeId: (a.officeId ?? null) as number | null,
  scheduledAt: toLocal(a.scheduledAt) || props.defaults?.scheduledAt || '',
  endsAt: toLocal(a.endsAt),
  timezone: a.timezone || '',
  meetingPoint: a.meetingPoint || '',
  notes: a.notes || '',
  internalNotes: a.internalNotes || '',
  confirmationStatus: a.confirmationStatus || 'pending',
  status: a.status || 'scheduled',
  cancellationReason: a.cancellationReason || '',
}
const form = reactive({ ...original })
const contact = ref<PickedEntity | null>(a.contactId ? { id: a.contactId, label: a.contactName || `Contacto #${a.contactId}` } : null)
const lead = ref<PickedEntity | null>(a.leadId ? { id: a.leadId, label: a.leadName || `Lead #${a.leadId}` } : null)
const property = ref<PickedEntity | null>(a.propertyId ? { id: a.propertyId, label: a.propertyName || `Inmueble #${a.propertyId}`, kind: a.propertyKind || 'developer' } : null)

watch(
  () => form.type,
  (t) => {
    if (t === 'video_call') form.channel = 'video'
  },
)

const offices = ref<RelationOption[]>([])
onMounted(() => loadRelationOptions('offices').then((r) => (offices.value = r)))

const agentSlot = computed(() => props.agents.find((x) => x.id === form.agentId)?.slotDurationMinutes || 60)
function addMinutesLocal(local: string, minutes: number): string {
  const d = new Date(`${local}:00Z`)
  return new Date(d.getTime() + minutes * 60_000).toISOString().slice(0, 16)
}
function setDuration(m: number) {
  if (form.scheduledAt) form.endsAt = addMinutesLocal(form.scheduledAt, m)
}
function keepEndAfterStart() {
  if (form.endsAt && form.scheduledAt && form.endsAt <= form.scheduledAt) form.endsAt = ''
}
const durationHint = computed(() => {
  if (!form.endsAt) return `Vacío = la franja del comercial (${agentSlot.value} min).`
  if (!form.scheduledAt) return ''
  const mins = Math.round((Date.parse(`${form.endsAt}:00Z`) - Date.parse(`${form.scheduledAt}:00Z`)) / 60_000)
  return mins > 0 ? `Duración: ${mins >= 60 ? `${Math.floor(mins / 60)} h ` : ''}${mins % 60 ? `${mins % 60} min` : ''}` : 'El fin tiene que ser posterior al inicio.'
})

const saving = ref(false)
const error = ref('')

function createBody() {
  return {
    type: form.type,
    channel: form.channel || undefined,
    clientName: form.clientName.trim() || null,
    clientEmail: form.clientEmail.trim() || null,
    clientPhone: form.clientPhone.trim() || null,
    agentId: form.agentId,
    officeId: form.officeId,
    contactId: contact.value?.id ?? null,
    leadId: lead.value?.id ?? null,
    propertyId: property.value?.id ?? null,
    propertyKind: property.value?.kind ?? null,
    scheduledAt: toServer(form.scheduledAt),
    endsAt: form.endsAt ? toServer(form.endsAt) : null,
    timezone: form.timezone.trim() || null,
    meetingPoint: form.meetingPoint.trim() || null,
    notes: form.notes.trim() || null,
    internalNotes: form.internalNotes.trim() || null,
    confirmationStatus: form.confirmationStatus === 'confirmed' ? 'pending' : form.confirmationStatus,
  }
}

/** Sólo lo que ha cambiado: así una cita confirmada por el cliente no pierde su confirmación por guardar una nota. */
function patchBody() {
  const body: Record<string, any> = {}
  for (const key of ['type', 'clientName', 'clientEmail', 'clientPhone', 'agentId', 'officeId', 'timezone', 'meetingPoint', 'notes', 'internalNotes', 'status'] as const) {
    const now = typeof form[key] === 'string' ? (form[key] as string).trim() : form[key]
    const before = typeof original[key] === 'string' ? (original[key] as string).trim() : original[key]
    if (now !== before) body[key] = now === '' ? null : now
  }
  if (form.channel !== original.channel && form.channel) body.channel = form.channel
  if (form.scheduledAt !== original.scheduledAt) body.scheduledAt = toServer(form.scheduledAt)
  if (form.endsAt !== original.endsAt && form.endsAt) body.endsAt = toServer(form.endsAt)
  if (form.confirmationStatus !== original.confirmationStatus) body.confirmationStatus = form.confirmationStatus
  if (form.status === 'cancelled' && (form.cancellationReason.trim() !== original.cancellationReason || original.status !== 'cancelled')) body.cancellationReason = form.cancellationReason.trim()
  if ((contact.value?.id ?? null) !== (a.contactId ?? null)) body.contactId = contact.value?.id ?? null
  if ((lead.value?.id ?? null) !== (a.leadId ?? null)) body.leadId = lead.value?.id ?? null
  if ((property.value?.id ?? null) !== (a.propertyId ?? null) || (property.value?.kind ?? null) !== (a.propertyId ? a.propertyKind || 'developer' : null)) {
    body.propertyId = property.value?.id ?? null
    body.propertyKind = property.value?.kind ?? null
  }
  return body
}

async function save() {
  error.value = ''
  if (!form.agentId) return (error.value = 'Falta el comercial')
  if (!form.scheduledAt) return (error.value = 'Falta el inicio')
  if (!form.clientName.trim() && !contact.value && !lead.value) return (error.value = 'Indica el cliente: un nombre, un contacto o un lead')
  if (isEdit.value && form.status === 'cancelled' && original.status !== 'cancelled' && !form.cancellationReason.trim()) return (error.value = 'Indica el motivo de la cancelación')
  saving.value = true
  try {
    if (isEdit.value) {
      const body = patchBody()
      if (!Object.keys(body).length) {
        emit('close')
        return
      }
      await $fetch(`/api/admin/saas/visits/${a.id}`, { method: 'PATCH', body })
      emit('saved', a.id)
    } else {
      const res = await $fetch<{ id: number }>('/api/admin/saas/visits', { method: 'POST', body: createBody() })
      emit('saved', res.id)
    }
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || 'No se pudo guardar la cita'
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.af-section {
  @apply mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-400;
}
.af-label {
  @apply mb-1 block text-[12px] font-medium text-stone-600;
}
.af-input {
  @apply w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink;
}
</style>
