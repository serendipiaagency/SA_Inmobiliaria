<template>
  <div class="flex flex-wrap items-center gap-1.5 text-xs" data-testid="match-actions">
    <span v-if="status" class="rounded-full px-2 py-0.5 text-[11px] font-medium" :class="statusClass" data-testid="match-status">{{ MATCH_STATUS_LABELS[status] || status }}</span>

    <template v-if="canEdit">
      <button
        v-if="status !== 'discarded' && !advanced"
        type="button"
        class="rounded-lg border px-2 py-1 font-medium hover:bg-stone-50"
        :class="status === 'selected' ? 'border-emerald-300 text-emerald-700' : 'border-line'"
        :disabled="busy"
        data-testid="match-select"
        @click="setStatus(status === 'selected' ? 'new' : 'selected')"
      >
        {{ status === 'selected' ? 'Quitar selección' : 'Seleccionar' }}
      </button>
      <template v-if="status !== 'discarded'">
        <button
          type="button"
          class="rounded-lg border border-line px-2 py-1 font-medium hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!contact || !hasPhone"
          :title="!contact ? 'Contacto no disponible' : hasPhone ? 'Enviar por WhatsApp' : 'Sin teléfono: no hay canal para enviarla'"
          data-testid="match-send-property"
          @click="open = 'send'"
        >
          Enviar propiedad
        </button>
        <button type="button" class="rounded-lg border border-line px-2 py-1 font-medium hover:bg-stone-50 disabled:opacity-50" :disabled="!contact" data-testid="match-create-selection" @click="open = 'selection'">
          Crear selección
        </button>
        <button type="button" class="rounded-lg border border-line px-2 py-1 font-medium hover:bg-stone-50 disabled:opacity-50" :disabled="!contact" data-testid="match-create-visit" @click="open = 'visit'">
          Crear visita
        </button>
        <button type="button" class="rounded-lg border border-line px-2 py-1 font-medium text-rose-700 hover:bg-rose-50" :disabled="busy" data-testid="match-discard" @click="open = 'discard'">
          Descartar
        </button>
      </template>
      <button v-else type="button" class="rounded-lg border border-line px-2 py-1 font-medium hover:bg-stone-50" :disabled="busy" data-testid="match-undiscard" @click="setStatus('new')">
        Recuperar
      </button>
      <span v-if="contact && !hasPhone && status !== 'discarded'" class="text-[11px] text-stone-400" data-testid="match-no-channel">Sin teléfono: no se le puede enviar</span>
    </template>

    <AdminMatchingSendPropertyModal v-if="open === 'send' && contact" :requirement-id="requirementId" :contact="contact" :property="property" @close="open = null" @sent="onSent" />
    <AdminMatchingSelectionModal
      v-if="open === 'selection' && contact"
      :requirement-id="requirementId"
      :contact-id="contact.id"
      :contact-name="contact.name"
      :requirement-title="requirementTitle"
      :items="[{ propertyId: property.id, propertyKind: property.kind, name: property.name }]"
      @close="open = null"
      @saved="onSelected"
    />
    <AdminMatchingVisitModal v-if="open === 'visit' && contact" :requirement-id="requirementId" :contact="contact" :property="property" :default-agent-id="defaultAgentId" @close="open = null" @saved="onVisit" />
    <AdminCommsModal v-if="open === 'discard'" title="Descartar" :sub="`${property.name}${contact ? ` · ${contact.name}` : ''}`" test-id="match-discard-modal" @close="open = null">
      <label class="block">
        <span class="mb-1 block text-[12px] font-medium text-stone-600">Motivo (opcional)</span>
        <input v-model="reason" class="w-full rounded-lg border border-line px-3 py-2 text-sm" maxlength="500" placeholder="Le pilla lejos del trabajo…" data-testid="match-discard-reason">
      </label>
      <p class="mt-2 text-[11px] text-stone-400">Un descarte sin motivo vuelve a aparecer mañana sin que nadie recuerde por qué se cayó. Se puede recuperar después.</p>
      <template #footer>
        <button type="button" class="text-[13px] text-stone-500 hover:underline" @click="open = null">Cancelar</button>
        <button type="button" class="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white" :disabled="busy" data-testid="match-discard-confirm" @click="discard">Descartar</button>
      </template>
    </AdminCommsModal>
  </div>
</template>

<script setup lang="ts">
import AdminCommsModal from '~/components/admin/comms/Modal.vue'
import AdminMatchingSendPropertyModal from '~/components/admin/matching/SendPropertyModal.vue'
import AdminMatchingSelectionModal from '~/components/admin/matching/SelectionModal.vue'
import AdminMatchingVisitModal from '~/components/admin/matching/VisitModal.vue'
import { MATCH_STATUS_LABELS } from '~/utils/buyerRequirementCatalog'

/**
 * Las acciones sobre una compatibilidad (FASE 11): seleccionar, enviar
 * propiedad, crear selección, crear visita y descartar — las mismas en la
 * ficha de propiedad («Compradores compatibles»), en Compatibilidades y en la
 * pestaña «Necesidades» del contacto. Nada se decide aquí: cada acción llama
 * a su endpoint, y el estado que se enseña es el que devuelve el servidor.
 */
type Persisted = { id: number; status: string; discardedReason: string | null } | null

const props = withDefaults(
  defineProps<{
    requirementId: number
    requirementTitle?: string | null
    contact: { id: number; name: string; email?: string | null; phone?: string | null; whatsapp?: string | null } | null
    property: { id: number; kind: 'agent' | 'developer'; name: string }
    persisted: Persisted
    defaultAgentId?: number | null
  }>(),
  { requirementTitle: null, defaultAgentId: null },
)
const emit = defineEmits<{ 'update:persisted': [value: Persisted] }>()
const toast = useToast()
const { canWrite } = useAdminPermissions()
const canEdit = computed(() => canWrite('crm'))

const open = ref<'send' | 'selection' | 'visit' | 'discard' | null>(null)
const busy = ref(false)
const reason = ref('')

const status = computed(() => props.persisted?.status || null)
/** Enviado, visitado u ofertado: ya no se vuelve a «seleccionado» a mano. */
const advanced = computed(() => ['sent', 'viewing', 'offered'].includes(status.value || ''))
const hasPhone = computed(() => !!(props.contact?.phone || props.contact?.whatsapp))
const statusClass = computed(() => {
  const s = status.value
  if (s === 'discarded') return 'bg-rose-50 text-rose-700'
  if (s === 'selected') return 'bg-emerald-50 text-emerald-700'
  if (s === 'sent' || s === 'viewing' || s === 'offered') return 'bg-sky-50 text-sky-700'
  return 'bg-stone-100 text-stone-600'
})

function update(next: Persisted) {
  emit('update:persisted', next)
}

async function setStatus(next: 'new' | 'selected' | 'discarded', discardedReason?: string) {
  busy.value = true
  try {
    const saved = await $fetch<any>('/api/admin/saas/matching/matches', {
      method: 'POST',
      body: { buyerRequirementId: props.requirementId, propertyId: props.property.id, propertyKind: props.property.kind, status: next, discardedReason },
    })
    update({ id: saved.id, status: saved.status, discardedReason: saved.discardedReason })
    return true
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || 'No se pudo guardar la decisión')
    return false
  } finally {
    busy.value = false
  }
}

async function discard() {
  if (await setStatus('discarded', reason.value.trim() || undefined)) {
    open.value = null
    reason.value = ''
  }
}

/** Tras un envío confirmado el servidor ya marcó el match (sólo hacia delante); aquí sólo se refleja. */
function onSent() {
  open.value = null
  if (!advanced.value) update({ id: props.persisted?.id ?? 0, status: 'sent', discardedReason: null })
}

function onSelected() {
  open.value = null
  if (!status.value || status.value === 'new') update({ id: props.persisted?.id ?? 0, status: 'selected', discardedReason: null })
}

function onVisit(res: { matchStatus: string }) {
  open.value = null
  if (res.matchStatus && res.matchStatus !== status.value) update({ id: props.persisted?.id ?? 0, status: res.matchStatus, discardedReason: null })
}
</script>
