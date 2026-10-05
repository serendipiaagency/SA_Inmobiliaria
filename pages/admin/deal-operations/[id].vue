<template>
  <div v-if="loadError" class="card p-8 text-center">
    <p class="text-sm font-medium text-stone-600">{{ loadError }}</p>
    <NuxtLink to="/admin/deal-operations" class="btn-quiet mt-4 inline-flex">Volver a Operaciones</NuxtLink>
  </div>

  <div v-else-if="detail">
    <div class="mb-6">
      <NuxtLink to="/admin/deal-operations" class="text-xs font-medium text-stone-400 hover:text-ink">← Operaciones</NuxtLink>
      <div class="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight">Operación #{{ deal.id }}</h1>
          <p class="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-stone-500">
            <NuxtLink :to="`/admin/${deal.propertyKind === 'developer' ? 'developer-properties' : 'properties'}/${deal.propertyId}`" class="hover:underline">
              {{ deal.propertyName || `Inmueble #${deal.propertyId}` }} ({{ deal.propertyKind === 'developer' ? 'obra nueva' : '2ª mano' }})
            </NuxtLink>
            <span>· {{ formatAmount(deal.agreedAmount, deal.currency) }}</span>
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <span class="rounded-full px-2.5 py-1 text-xs font-semibold" :class="DEAL_STATUS_CLS[deal.status]" data-testid="deal-status">{{ DEAL_STATUS_LABELS[deal.status] || deal.status }}</span>
        </div>
      </div>
    </div>

    <!-- Pipeline de etapas -->
    <AdminPanel title="Etapa" class="mb-6">
      <div class="flex flex-wrap gap-1.5" data-testid="deal-stages">
        <button
          v-for="s in DEAL_STAGES"
          :key="s"
          type="button"
          class="rounded-lg border px-3 py-1.5 text-xs font-medium transition"
          :class="s === deal.stage ? 'border-ink bg-ink text-white' : 'border-line hover:bg-stone-50'"
          :disabled="deal.status !== 'active' || movingStage || !canEdit"
          :data-testid="`deal-stage-${s}`"
          @click="s === 'closed' ? closeDeal() : moveStage(s)"
        >
          {{ DEAL_STAGE_LABELS[s] }}
        </button>
      </div>
      <label v-if="deal.status === 'active' && canEdit" class="mt-3 block max-w-md">
        <span class="mb-1 block text-[12px] font-medium text-stone-600">Motivo del cambio (opcional, queda en el historial)</span>
        <input v-model="stageReason" class="input" placeholder="Firmadas las arras en la notaría…" data-testid="deal-stage-reason" >
      </label>
      <div v-if="deal.status === 'active' && canEdit" class="mt-4 flex justify-end">
        <button type="button" class="btn-quiet !px-2.5 !py-1 text-xs text-red-600" @click="promptCancel">Cancelar operación</button>
      </div>
      <p v-if="deal.status === 'cancelled'" class="mt-3 text-xs text-stone-500">Cancelada{{ deal.cancelReason ? `: ${deal.cancelReason}` : '' }} — {{ formatDateTime(deal.cancelledAt) }}</p>
      <p v-if="deal.status === 'closed'" class="mt-3 text-xs text-stone-500">Cerrada el {{ formatDateTime(deal.closedAt) }}</p>
    </AdminPanel>

    <div class="grid gap-6 lg:grid-cols-3">
      <div class="space-y-6 lg:col-span-2">
        <AdminPanel title="Historial de etapas">
          <p v-if="!detail.stageHistory.length" class="py-6 text-center text-sm text-stone-400">Sin movimientos todavía.</p>
          <ul v-else class="space-y-3" data-testid="deal-stage-history">
            <li v-for="h in [...detail.stageHistory].reverse()" :key="h.id" class="border-l-2 border-line pl-3 text-[13px]">
              <p class="font-medium text-ink">{{ h.fromStage ? `${DEAL_STAGE_LABELS[h.fromStage] || h.fromStage} → ${DEAL_STAGE_LABELS[h.toStage] || h.toStage}` : `Creada — ${DEAL_STAGE_LABELS[h.toStage] || h.toStage}` }}</p>
              <p class="text-[11px] text-stone-400">
                {{ formatDateTime(h.createdAt) }}<template v-if="h.actorName"> · {{ h.actorName }}</template><template v-if="h.reason"> · {{ h.reason }}</template>
              </p>
            </li>
          </ul>
        </AdminPanel>

        <DealRecordsPanel :deal-id="deal.id" :records="detail.records" :can-edit="canEdit" @changed="reloadAll" />

        <AdminPanel title="Tareas">
          <template #action>
            <button v-if="canEdit" type="button" class="btn-quiet !px-2.5 !py-1 text-xs" data-testid="deal-task-new" @click="newTask = true">+ Nueva tarea</button>
          </template>
          <p v-if="!detail.tasks.length" class="py-6 text-center text-sm text-stone-400">Sin tareas todavía.</p>
          <ul v-else class="divide-y divide-line">
            <li v-for="t in detail.tasks" :key="t.id" class="flex items-center justify-between gap-3 py-2.5">
              <div class="min-w-0">
                <p class="truncate text-[13px] font-medium text-ink">{{ t.title }}</p>
                <p class="text-[11px] text-stone-400">
                  {{ TASK_TYPE_LABELS[t.type] || t.type }} · {{ agentName(t.assigneeId) || 'Sin asignar' }}<template v-if="t.dueAt"> · vence {{ formatDateTime(t.dueAt) }}</template>
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-1">
                <span class="text-[11px] text-stone-400">{{ TASK_STATUS_LABELS[t.status] || t.status }}</span>
                <button v-if="canEdit && (t.status === 'open' || t.status === 'in_progress')" type="button" class="btn-quiet !px-2 !py-1 text-[11px]" @click="completeTask(t)">Completar</button>
                <button v-if="canEdit" type="button" class="btn-quiet !px-2 !py-1 text-[11px]" @click="editingTask = t">Editar</button>
              </div>
            </li>
          </ul>
        </AdminPanel>

        <AdminPanel title="Citas" sub="Notaría, firma y cualquier otra — aparecen también en Calendar.">
          <template #action>
            <button v-if="canEdit" type="button" class="btn-quiet !px-2.5 !py-1 text-xs" @click="openNewAppointment">+ Cita</button>
          </template>
          <p v-if="!detail.appointments.length" class="py-6 text-center text-sm text-stone-400">Sin citas todavía.</p>
          <ul v-else class="divide-y divide-line">
            <li v-for="v in detail.appointments" :key="v.id" class="py-2.5 text-[13px]">
              <p class="font-medium text-ink">{{ appointmentTypeLabel(v.type) }} — {{ formatDateTime(v.scheduledAt) }}</p>
              <p class="text-[11px] text-stone-400">{{ v.agentName }} · {{ v.status }}</p>
            </li>
          </ul>
        </AdminPanel>

        <AdminPanel title="Actividad" sub="Lo que ha pasado en esta operación, en su oferta, sus tareas y sus citas.">
          <ActivityTimeline :filter="{ dealId: deal.id }" :refresh-key="activityKey" empty-text="Sin actividad registrada en esta operación." />
        </AdminPanel>
      </div>

      <div class="space-y-6">
        <AdminPanel title="Partes">
          <dl class="space-y-3 text-sm">
            <div>
              <dt class="text-xs text-stone-400">Comprador</dt>
              <dd><NuxtLink :to="`/admin/contactos/${deal.buyerContactId}`" class="hover:underline">{{ deal.buyerName || buyerName || `Contacto #${deal.buyerContactId}` }}</NuxtLink></dd>
            </div>
            <div v-if="detail.sellers?.length">
              <dt class="text-xs text-stone-400">Vendedor{{ detail.sellers.length > 1 ? 'es' : '' }}</dt>
              <dd v-for="s in detail.sellers" :key="s.id"><NuxtLink :to="`/admin/contactos/${s.id}`" class="hover:underline">{{ s.name || `Contacto #${s.id}` }}</NuxtLink></dd>
            </div>
            <div>
              <dt class="text-xs text-stone-400">Comercial</dt>
              <dd v-if="canEdit">
                <select class="input !py-1.5 !text-xs" :value="deal.commercialId || ''" data-testid="deal-commercial" @change="updateDeal({ commercialId: ($event.target as HTMLSelectElement).value || null })">
                  <option value="">Sin comercial</option>
                  <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
                </select>
              </dd>
              <dd v-else>{{ deal.commercialName || '—' }}</dd>
            </div>
            <div>
              <dt class="text-xs text-stone-400">Oficina</dt>
              <dd v-if="canEdit">
                <select class="input !py-1.5 !text-xs" :value="deal.officeId || ''" data-testid="deal-office" @change="updateDeal({ officeId: ($event.target as HTMLSelectElement).value || null })">
                  <option value="">Sin oficina</option>
                  <option v-for="o in offices" :key="o.id" :value="o.id">{{ o.label }}</option>
                </select>
              </dd>
              <dd v-else>{{ deal.officeName || '—' }}</dd>
            </div>
            <div v-if="detail.nextAction">
              <dt class="text-xs text-stone-400">Próxima acción</dt>
              <dd>{{ nextActionLabel(detail.nextAction.type) }} · {{ formatDateTime(detail.nextAction.at) }}</dd>
            </div>
          </dl>
        </AdminPanel>

        <AdminPanel title="Oferta aceptada">
          <dl v-if="detail.acceptedOffer" class="space-y-2 text-sm">
            <div>
              <dt class="text-xs text-stone-400">Importe</dt>
              <dd>{{ formatAmount(detail.acceptedOffer.currentAmount, detail.acceptedOffer.currency) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-stone-400">Financiación</dt>
              <dd>{{ offerFinanceLabel(detail.acceptedOffer.currentFinanceCondition) }}</dd>
            </div>
            <div v-if="detail.acceptedOffer.currentConditions">
              <dt class="text-xs text-stone-400">Condiciones</dt>
              <dd class="whitespace-pre-line">{{ detail.acceptedOffer.currentConditions }}</dd>
            </div>
          </dl>
          <button type="button" class="btn-quiet mt-3 !px-2.5 !py-1 text-xs" data-testid="deal-open-offer" @click="offerOpen = true">Ver la negociación (oferta #{{ deal.acceptedOfferId }})</button>
        </AdminPanel>
      </div>
    </div>

    <!-- FASE 29 §142 — la relación Deal↔Conversation se deriva del comprador
         (sus leads/clientes), no se guarda en la operación. -->
    <section v-if="buyerCommunications" class="mt-6" data-testid="deal-communications">
      <h2 class="mb-3 text-sm font-semibold text-ink">Comunicaciones con el comprador</h2>
      <AdminCommsRelatedCommunications :conversations="buyerCommunications.conversations" :calls="buyerCommunications.calls" :emails="buyerCommunications.emails" />
    </section>

    <TaskFormModal v-if="newTask" :agents="agents" :locked="['deal']" :defaults="taskDefaults" @close="newTask = false" @saved="onTaskSaved('Tarea creada')" />
    <TaskFormModal v-if="editingTask" :task="editingTask" :agents="agents" @close="editingTask = null" @saved="onTaskSaved('Tarea actualizada')" />
    <OfferDetailModal v-if="offerOpen" :offer-id="deal.acceptedOfferId" @close="offerOpen = false" />

    <!-- Nueva cita -->
    <div v-if="newAppointment" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="newAppointment = false">
      <div class="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h3 class="mb-4 text-sm font-semibold">Nueva cita</h3>
        <div class="space-y-3">
          <select v-model="apptForm.type" class="input">
            <option v-for="t in DEAL_APPOINTMENT_TYPES" :key="t" :value="t">{{ APPOINTMENT_TYPE_LABELS[t] }}</option>
          </select>
          <select v-model="apptForm.agentId" class="input">
            <option value="">Elige un comercial…</option>
            <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
          <input v-model="apptForm.scheduledAt" type="datetime-local" class="input" >
        </div>
        <p v-if="apptError" class="mt-3 text-sm font-medium text-red-600">{{ apptError }}</p>
        <div class="mt-4 flex justify-end gap-2">
          <button class="btn-secondary" @click="newAppointment = false">Cancelar</button>
          <button class="btn-primary" :disabled="!apptForm.agentId || !apptForm.scheduledAt || savingAppt" @click="submitNewAppointment">{{ savingAppt ? 'Guardando…' : 'Crear cita' }}</button>
        </div>
      </div>
    </div>
  </div>

  <div v-else class="card px-4 py-20 text-center text-sm text-stone-400">Cargando…</div>
</template>

<script setup lang="ts">
import { formatDateTime } from '~/composables/useClientConfig'
import { APPOINTMENT_TYPE_LABELS, appointmentTypeLabel } from '~/utils/appointmentCatalog'
import { loadRelationOptions, type RelationOption } from '~/composables/useRelationOptions'
import ActivityTimeline from '~/components/admin/activity/ActivityTimeline.vue'
import TaskFormModal from '~/components/admin/tasks/TaskFormModal.vue'
import OfferDetailModal from '~/components/admin/offers/OfferDetailModal.vue'
import DealRecordsPanel from '~/components/admin/deals/DealRecordsPanel.vue'
import { DEAL_STAGES, DEAL_STAGE_LABELS, DEAL_STATUS_LABELS, TASK_STATUS_LABELS, TASK_TYPE_LABELS, formatAmount, nextActionLabel, offerFinanceLabel } from '~/utils/pipelineCatalog'

/**
 * Ficha de la Operación (FASE 24) — inmueble, comprador, vendedores,
 * importe acordado, control de etapa con su historial (quién, cuándo y por
 * qué), tareas y citas. Bloque N6: oficina y comercial editables, la oferta
 * aceptada con su negociación completa, las reservas, arras y contratos
 * vinculados, y la cronología de actividad de la operación. Ver
 * docs/deals.md.
 */
definePageMeta({ layout: 'admin', middleware: 'admin' })

const route = useRoute()
const id = route.params.id as string
const toast = useToast()
const { confirm } = useConfirm()
const { canWrite } = useAdminPermissions()
const canEdit = computed(() => canWrite('crm'))

const DEAL_STATUS_CLS: Record<string, string> = { active: 'bg-blue-50 text-blue-700', closed: 'bg-emerald-50 text-emerald-700', cancelled: 'bg-stone-100 text-stone-500' }

const loadError = ref('')
const { data: detail, refresh } = await useFetch<any>('/api/admin/saas/deal-operations', {
  query: { id },
  onResponseError({ response }) {
    loadError.value = response.status === 404 ? 'Esta operación no existe, o no pertenece a tu inmobiliaria.' : 'No se pudo cargar la operación.'
  },
})
const deal = computed<any>(() => detail.value?.deal)

useHead({ title: () => (detail.value ? `Operación #${detail.value.deal.id} — CRM` : 'Operación') })

const { data: agentsData } = await useFetch<any>('/api/admin/saas/agents')
const agents = computed<any[]>(() => agentsData.value?.rows || [])
function agentName(agentId: number | null) {
  return agents.value.find((a) => a.id === agentId)?.name || ''
}
const offices = ref<RelationOption[]>([])
onMounted(() => loadRelationOptions('offices').then((r) => (offices.value = r)))

// GET /api/admin/saas/contacts/:id devuelve { contact, leads, clients, communications, ... }.
const buyerName = ref('')
const buyerCommunications = ref<any>(null)
watchEffect(async () => {
  if (!detail.value) return
  const buyer = await $fetch<any>(`/api/admin/saas/contacts/${detail.value.deal.buyerContactId}`).catch(() => null)
  buyerName.value = buyer?.contact?.name || ''
  buyerCommunications.value = buyer?.communications ?? null
})

const activityKey = ref(0)
async function reloadAll() {
  await refresh()
  activityKey.value++
}

const movingStage = ref(false)
const stageReason = ref('')
async function moveStage(stage: string) {
  if (stage === deal.value.stage) return
  movingStage.value = true
  try {
    await $fetch('/api/admin/saas/deal-operations', { method: 'POST', body: { id: Number(id), action: 'stage', toStage: stage, reason: stageReason.value.trim() || undefined } })
    stageReason.value = ''
    await reloadAll()
    toast.success('Etapa actualizada')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo cambiar de etapa')
  } finally {
    movingStage.value = false
  }
}
async function closeDeal() {
  const ok = await confirm('La operación quedará cerrada y se creará su apunte en «Cierres y comisiones».', { title: '¿Cerrar la operación?', confirmLabel: 'Cerrar operación' })
  if (!ok) return
  try {
    await $fetch('/api/admin/saas/deal-operations', { method: 'POST', body: { id: Number(id), action: 'close', reason: stageReason.value.trim() || undefined } })
    stageReason.value = ''
    await reloadAll()
    toast.success('Operación cerrada')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo cerrar la operación')
  }
}
async function promptCancel() {
  const reason = window.prompt('Motivo de la cancelación')
  if (!reason?.trim()) return
  try {
    await $fetch('/api/admin/saas/deal-operations', { method: 'POST', body: { id: Number(id), action: 'cancel', reason } })
    await reloadAll()
    toast.success('Operación cancelada')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo cancelar la operación')
  }
}

async function updateDeal(patch: { officeId?: string | number | null; commercialId?: string | number | null }) {
  try {
    await $fetch('/api/admin/saas/deal-operations', { method: 'POST', body: { id: Number(id), action: 'update', ...patch } })
    await refresh()
    toast.success('Operación actualizada')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo guardar')
  }
}

// --- Tareas: la operación queda fijada; comprador, inmueble y lead vienen propuestos ---
const newTask = ref(false)
const editingTask = ref<any | null>(null)
const taskDefaults = computed<any>(() => {
  const d = deal.value
  if (!d) return {}
  return {
    deal: { id: d.id, label: `Operación #${d.id}` },
    contact: { id: d.buyerContactId, label: d.buyerName || buyerName.value || `Contacto #${d.buyerContactId}` },
    property: { id: d.propertyId, kind: d.propertyKind, label: d.propertyName || `Inmueble #${d.propertyId}` },
    lead: d.leadId ? { id: d.leadId, label: `Lead #${d.leadId}` } : null,
    assigneeId: d.commercialId || null,
    type: 'document',
  }
})
function onTaskSaved(message: string) {
  newTask.value = false
  editingTask.value = null
  toast.success(message)
  reloadAll()
}
async function completeTask(t: any) {
  try {
    await $fetch(`/api/admin/saas/tasks/${t.id}`, { method: 'PATCH', body: { status: 'completed' } })
    await reloadAll()
    toast.success('Tarea completada')
  } catch {
    toast.error('No se pudo completar la tarea')
  }
}

const offerOpen = ref(false)

// --- Citas ------------------------------------------------------------------
const newAppointment = ref(false)
/** Las citas que tienen sentido dentro de una operación (FASE 24): notaría, firma, reunión, tasación, llamada… */
const DEAL_APPOINTMENT_TYPES = ['notary', 'signing', 'meeting', 'valuation', 'call', 'video_call', 'other'] as const
const apptForm = reactive({ type: 'notary', agentId: '' as string | number, scheduledAt: '' })
const apptError = ref('')
const savingAppt = ref(false)
function openNewAppointment() {
  apptForm.type = 'notary'
  apptForm.agentId = deal.value?.commercialId || ''
  apptForm.scheduledAt = ''
  apptError.value = ''
  newAppointment.value = true
}
async function submitNewAppointment() {
  if (!apptForm.agentId || !apptForm.scheduledAt) return
  savingAppt.value = true
  apptError.value = ''
  try {
    await $fetch('/api/admin/saas/visits', {
      method: 'POST',
      body: {
        clientName: deal.value?.buyerName || buyerName.value || `Comprador #${deal.value?.buyerContactId}`,
        agentId: apptForm.agentId,
        scheduledAt: apptForm.scheduledAt.replace('T', ' ') + ':00',
        type: apptForm.type,
        propertyId: deal.value?.propertyId,
        propertyKind: deal.value?.propertyKind,
        leadId: deal.value?.leadId,
        // Sin lead, la cita se vincula directamente al comprador (con un lead, hereda su persona).
        contactId: deal.value?.leadId ? null : deal.value?.buyerContactId ?? null,
        dealId: Number(id),
      },
    })
    newAppointment.value = false
    await reloadAll()
    toast.success('Cita creada')
  } catch (e: any) {
    apptError.value = e?.data?.statusMessage || 'No se pudo crear la cita'
  } finally {
    savingAppt.value = false
  }
}
</script>
