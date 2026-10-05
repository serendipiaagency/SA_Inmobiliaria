<template>
  <div v-if="data">
    <NuxtLink to="/admin/leads" class="mb-3 inline-block text-[13px] text-stone-500 hover:text-ink">← Leads</NuxtLink>

    <!-- CABECERA -->
    <header class="mb-5 flex flex-wrap items-start justify-between gap-4" data-testid="lead-header">
      <div class="min-w-0">
        <h1 class="text-2xl font-semibold tracking-tight" data-testid="lead-name">{{ lead.name }}</h1>
        <div class="mt-1.5 flex flex-wrap items-center gap-2 text-[13px]">
          <span class="rounded-full px-2.5 py-0.5 text-[12px] font-medium" :class="lead.status === 'lost' ? 'bg-stone-200 text-stone-600' : 'bg-ink text-white'" data-testid="lead-stage">
            {{ lead.status === 'lost' ? `Perdido · ${LEAD_LOST_REASON_LABELS[lead.lostReason] || lead.lostReason || ''}` : LEAD_STAGE_LABELS[lead.stage] || lead.stage }}
          </span>
          <span v-if="lead.priority" class="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800" data-testid="lead-priority">Prioridad {{ LEAD_PRIORITY_LABELS[lead.priority] || lead.priority }}</span>
          <span class="text-stone-500">{{ leadSourceLabel(lead.source) }}{{ lead.sourceDetail ? ` · ${lead.sourceDetail}` : '' }}</span>
          <span class="text-stone-400">· creado {{ formatDateTime(lead.createdAt) }}{{ data.createdByName ? ` por ${data.createdByName}` : '' }}</span>
        </div>
        <p v-if="data.contact" class="mt-1 text-[13px]">
          Contacto: <NuxtLink :to="`/admin/contactos/${data.contact.id}`" class="font-medium underline" data-testid="lead-contact-link">{{ data.contact.name }}</NuxtLink>
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <AdminLeadScoreBadge :lead="lead" @updated="(u: any) => Object.assign(lead, u)" />
        <AdminCommsContactActions v-if="lead.phone" :lead-id="lead.id" :phone="lead.phone" :name="lead.name" />
        <template v-if="canEdit">
          <button type="button" class="btn-secondary" data-testid="lead-edit" @click="editing = true">Editar</button>
          <button v-if="lead.status !== 'lost'" type="button" class="btn-secondary" data-testid="lead-mark-lost" @click="losing = true">Marcar como perdido</button>
          <button v-else type="button" class="btn-secondary" data-testid="lead-reactivate" @click="reactivate">Reactivar</button>
        </template>
      </div>
    </header>

    <div v-if="data.slaAlerts.length" class="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900" data-testid="lead-sla-alerts">
      <span v-for="a in data.slaAlerts" :key="a.id" class="mr-3">⚠ {{ SLA_LABELS[a.type] || a.type }} desde {{ formatDateTime(a.openedAt) }}</span>
    </div>

    <div class="grid gap-4 lg:grid-cols-3">
      <!-- FASE Y COMERCIAL -->
      <AdminPanel title="Fase del pipeline" class="lg:col-span-2">
        <div v-if="canEdit && lead.status !== 'lost'" class="flex flex-wrap items-end gap-2">
          <label class="block">
            <span class="mb-1 block text-[12px] font-medium text-stone-600">Nueva fase</span>
            <select v-model="stageForm.stage" class="cfg-input !w-44" data-testid="lead-stage-select">
              <option v-for="s in LEAD_STAGES" :key="s" :value="s">{{ LEAD_STAGE_LABELS[s] }}</option>
            </select>
          </label>
          <label class="block min-w-0 flex-1">
            <span class="mb-1 block text-[12px] font-medium text-stone-600">Motivo (queda en el historial)</span>
            <input v-model="stageForm.reason" class="cfg-input" placeholder="Llamada hecha, quiere ver pisos en el centro…" data-testid="lead-stage-reason" >
          </label>
          <button type="button" class="dash-btn-primary" :disabled="stageForm.stage === lead.stage || changingStage" data-testid="lead-stage-save" @click="changeStage">
            {{ changingStage ? 'Guardando…' : 'Cambiar fase' }}
          </button>
        </div>
        <p v-else-if="lead.status === 'lost'" class="text-sm text-stone-500">El lead está perdido; reactívalo para moverlo en el pipeline (vuelve a «{{ LEAD_STAGE_LABELS[lead.stage] }}»).</p>
        <ol class="mt-4 flex flex-wrap gap-1 text-[11px]">
          <li
            v-for="s in LEAD_STAGES"
            :key="s"
            class="rounded-full px-2 py-0.5"
            :class="s === lead.stage ? 'bg-ink text-white' : LEAD_STAGES.indexOf(s) < LEAD_STAGES.indexOf(lead.stage) ? 'bg-stone-200 text-stone-600' : 'bg-stone-50 text-stone-400'"
          >
            {{ LEAD_STAGE_LABELS[s] }}
          </li>
        </ol>
      </AdminPanel>

      <AdminPanel title="Comercial">
        <p class="text-sm font-medium" data-testid="lead-agent">{{ lead.agentName || 'Sin asignar' }}</p>
        <p class="text-[12px] text-stone-500">{{ data.officeName ? `Oficina ${data.officeName}` : 'Sin oficina' }}{{ data.teamName ? ` · Equipo ${data.teamName}` : '' }}</p>
        <div v-if="canEdit" class="mt-3 space-y-2">
          <select v-model="assignForm.commercialId" class="cfg-input" data-testid="lead-reassign-select">
            <option :value="null">Sin asignar</option>
            <option v-for="o in commercials" :key="o.id" :value="o.id">{{ o.label }}</option>
          </select>
          <input v-model="assignForm.reason" class="cfg-input" placeholder="Motivo de la reasignación" data-testid="lead-reassign-reason" >
          <button type="button" class="btn-secondary w-full" :disabled="assignForm.commercialId === (lead.agentId ?? null) || reassigning" data-testid="lead-reassign-save" @click="reassign">Reasignar</button>
        </div>
      </AdminPanel>
    </div>

    <!-- HITOS (SLA) -->
    <AdminPanel title="Tiempos (SLA)" class="mt-4">
      <dl class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4" data-testid="lead-milestones">
        <div v-for="m in milestones" :key="m.key" :data-testid="`lead-milestone-${m.key}`">
          <dt class="text-[11px] uppercase tracking-wide text-stone-400">{{ m.label }}</dt>
          <dd :class="m.value ? 'font-medium' : 'text-stone-400'">{{ m.value ? formatDateTime(m.value) : '—' }}</dd>
          <dd v-if="m.key === 'next-action' && lead.nextActionType" class="text-[12px] text-stone-500" data-testid="lead-next-action-type">{{ nextActionLabel(lead.nextActionType) }}</dd>
        </div>
      </dl>
    </AdminPanel>

    <!-- PESTAÑAS -->
    <nav class="mb-4 mt-6 flex flex-wrap gap-1.5" data-testid="lead-tabs">
      <button
        v-for="t in tabs"
        :key="t.key"
        type="button"
        class="rounded-full border px-3 py-1 text-[12px] font-medium transition"
        :class="tab === t.key ? 'border-ink bg-ink text-white' : 'border-line bg-white text-stone-600 hover:bg-stone-50'"
        :data-testid="`lead-tab-${t.key}`"
        @click="tab = t.key"
      >
        {{ t.label }}<span v-if="t.count" class="ml-1 opacity-70">{{ t.count }}</span>
      </button>
    </nav>

    <!-- DATOS -->
    <section v-show="tab === 'datos'" data-testid="lead-datos">
      <AdminPanel>
        <dl class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div v-for="f in dataFields" :key="f.label">
            <dt class="text-[11px] uppercase tracking-wide text-stone-400">{{ f.label }}</dt>
            <dd class="break-words" :class="f.value ? '' : 'text-stone-400'">{{ f.value || '—' }}</dd>
          </div>
        </dl>
        <div v-if="lead.originalMessage" class="mt-4 rounded-lg bg-stone-50 p-3 text-sm" data-testid="lead-original-message">
          <p class="mb-1 text-[11px] uppercase tracking-wide text-stone-400">Mensaje original (tal cual llegó)</p>
          <p class="whitespace-pre-line">{{ lead.originalMessage }}</p>
        </div>
        <div v-if="lead.notes" class="mt-3 text-sm">
          <p class="mb-1 text-[11px] uppercase tracking-wide text-stone-400">Notas internas</p>
          <p class="whitespace-pre-line">{{ lead.notes }}</p>
        </div>
      </AdminPanel>
    </section>

    <!-- HISTORIAL DE FASES -->
    <section v-show="tab === 'historial'" data-testid="lead-stage-history">
      <p v-if="!data.stageHistory.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">Aún no ha cambiado de fase.</p>
      <AdminPanel v-else :pad="false">
        <table class="w-full text-sm">
          <thead class="border-b border-line bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-400">
            <tr>
              <th class="px-4 py-2">Fecha</th>
              <th class="px-4 py-2">Usuario</th>
              <th class="px-4 py-2">De</th>
              <th class="px-4 py-2">A</th>
              <th class="px-4 py-2">Motivo</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="h in data.stageHistory" :key="h.id" class="border-b border-line/60 last:border-0" data-testid="lead-stage-history-row">
              <td class="px-4 py-2 text-stone-500">{{ formatDateTime(h.createdAt) }}</td>
              <td class="px-4 py-2">{{ h.userName || (h.userId ? `Usuario #${h.userId}` : 'Sistema') }}</td>
              <td class="px-4 py-2 text-stone-500">{{ h.fromStage ? LEAD_STAGE_LABELS[h.fromStage] || h.fromStage : '—' }}</td>
              <td class="px-4 py-2 font-medium" data-testid="lead-stage-history-to">{{ LEAD_STAGE_LABELS[h.toStage] || h.toStage }}</td>
              <td class="px-4 py-2" data-testid="lead-stage-history-reason">{{ h.reason || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </AdminPanel>
    </section>

    <!-- ASIGNACIONES -->
    <section v-show="tab === 'asignaciones'" data-testid="lead-assignments">
      <p v-if="!data.assignmentHistory.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">Nunca se ha asignado.</p>
      <AdminPanel v-else :pad="false">
        <ul class="divide-y divide-line text-sm">
          <li v-for="a in data.assignmentHistory" :key="a.id" class="px-4 py-3" data-testid="lead-assignment-row">
            <p class="font-medium">{{ a.fromCommercialName || 'Sin asignar' }} → {{ a.toCommercialName || 'Sin asignar' }}</p>
            <p class="text-[12px] text-stone-500">{{ a.reason }}{{ a.ruleName ? ` · regla «${a.ruleName}»` : '' }}</p>
            <p class="text-[11px] text-stone-400">{{ formatDateTime(a.createdAt) }} · {{ a.assignedByName ? `por ${a.assignedByName}` : 'enrutado automático' }}</p>
          </li>
        </ul>
      </AdminPanel>
    </section>

    <!-- NOTAS -->
    <section v-show="tab === 'notas'" data-testid="lead-notas">
      <NotesPanel entity-type="lead" :entity-id="leadId" :can-edit="canEdit" @count="notesCount = $event" />
    </section>

    <!-- TAREAS -->
    <section v-show="tab === 'tareas'" data-testid="lead-tareas">
      <form v-if="canEdit" class="mb-3 flex flex-wrap gap-2" @submit.prevent="addTask">
        <input v-model="taskTitle" class="cfg-input min-w-0 flex-1" placeholder="Nueva tarea para este lead…" aria-label="Nueva tarea" data-testid="lead-task-title" >
        <input v-model="taskDue" type="date" class="cfg-input !w-40" aria-label="Fecha límite" >
        <button type="submit" class="dash-btn-primary" :disabled="!taskTitle.trim()" data-testid="lead-task-add">Añadir</button>
      </form>
      <p v-if="!tasks.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">Sin tareas.</p>
      <AdminPanel v-else :pad="false">
        <ul class="divide-y divide-line text-sm">
          <li v-for="t in tasks" :key="t.id" class="flex flex-wrap items-center justify-between gap-2 px-4 py-3" data-testid="lead-task-row">
            <div class="min-w-0">
              <p class="font-medium" :class="t.status === 'completed' ? 'text-stone-400 line-through' : ''">{{ t.title }}</p>
              <p class="text-xs text-stone-400">{{ t.dueAt ? `Vence ${formatDateTime(t.dueAt)}` : 'Sin fecha' }}</p>
            </div>
            <AdminStatusPill :status="t.status" />
          </li>
        </ul>
      </AdminPanel>
    </section>

    <!-- ACTIVIDAD -->
    <section v-show="tab === 'actividad'" data-testid="lead-actividad">
      <ActivityTimeline :filter="{ leadId }" :refresh-key="activityKey" />
    </section>

    <!-- VISITAS -->
    <section v-show="tab === 'visitas'" data-testid="lead-visitas">
      <p v-if="!data.visits.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">Sin citas para este lead.</p>
      <AdminPanel v-else :pad="false">
        <ul class="divide-y divide-line text-sm">
          <li v-for="v in data.visits" :key="v.id" class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div class="min-w-0">
              <p class="font-medium">{{ appointmentTypeLabel(v.type) }}{{ v.propertyName ? ` — ${v.propertyName}` : '' }}</p>
              <p class="text-xs text-stone-400">{{ formatDateTime(v.scheduledAt) }} · {{ v.agentName || 'Sin comercial' }}<span v-if="v.outcome"> · {{ visitOutcomeLabel(v.outcome) }}</span><span v-if="v.interestLevel"> · interés {{ v.interestLevel }}/5</span></p>
            </div>
            <AdminStatusPill :status="v.status" />
          </li>
        </ul>
      </AdminPanel>
    </section>

    <!-- OFERTAS -->
    <section v-show="tab === 'ofertas'" data-testid="lead-ofertas">
      <p v-if="!offers.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">Sin ofertas.</p>
      <AdminPanel v-else :pad="false">
        <ul class="divide-y divide-line text-sm">
          <li v-for="o in offers" :key="o.id" class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div class="min-w-0">
              <p class="font-medium">{{ o.propertyName || `Propiedad #${o.propertyId}` }}</p>
              <p class="text-xs text-stone-400">{{ formatDateTime(o.createdAt) }}</p>
            </div>
            <span class="flex items-center gap-2">
              <span class="tabular-nums">{{ o.currentAmount != null ? money(o.currentAmount) : o.amount != null ? money(o.amount) : '—' }}</span>
              <AdminStatusPill :status="o.status" />
            </span>
          </li>
        </ul>
      </AdminPanel>
    </section>

    <!-- COMUNICACIONES -->
    <section v-show="tab === 'comunicaciones'" data-testid="lead-comunicaciones">
      <p v-if="!data.conversations.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">
        Sin conversaciones de WhatsApp con este lead.{{ data.contact ? ' Las del contacto están en su ficha, pestaña Comunicaciones.' : '' }}
      </p>
      <AdminPanel v-else :pad="false">
        <ul class="divide-y divide-line text-sm">
          <li v-for="c in data.conversations" :key="c.id" class="px-4 py-3">
            <NuxtLink :to="`/admin/comunicaciones?conversation=${c.id}`" class="font-medium hover:underline">{{ c.lastMessagePreview || 'Conversación' }}</NuxtLink>
            <p class="text-xs text-stone-400">{{ formatDateTime(c.lastMessageAt) }}</p>
          </li>
        </ul>
      </AdminPanel>
    </section>

    <LeadFormModal v-if="editing" :lead="lead" @close="editing = false" @saved="onSaved" />
    <LeadLostModal v-if="losing" :name="lead.name" @close="losing = false" @confirm="markLost" />
  </div>
</template>

<script setup lang="ts">
import { LEAD_LOST_REASON_LABELS, LEAD_PRIORITY_LABELS, LEAD_STAGES, LEAD_STAGE_LABELS, leadSourceLabel } from '~/utils/leadCatalog'
import { LANGUAGE_LABELS } from '~/utils/crmCatalog'
import { appointmentTypeLabel, visitOutcomeLabel } from '~/utils/appointmentCatalog'
import { formatDateTime } from '~/composables/useClientConfig'
import { nextActionLabel } from '~/utils/pipelineCatalog'
import ActivityTimeline from '~/components/admin/activity/ActivityTimeline.vue'
import { loadRelationOptions, type RelationOption } from '~/composables/useRelationOptions'
import NotesPanel from '~/components/admin/notes/NotesPanel.vue'
import LeadFormModal from '~/components/admin/leads/LeadFormModal.vue'
import LeadLostModal from '~/components/admin/leads/LeadLostModal.vue'

/**
 * Ficha del lead (núcleo inmobiliario, FASES 12-16): todos sus campos, la
 * fase con su motivo, perdido/reactivar con motivo del catálogo, el
 * comercial, los hitos SLA, y sus historiales y relaciones. Los datos llegan
 * de GET /api/admin/leads/:id (server/utils/leads/admin.ts#getLeadDetail);
 * tareas, ofertas y actividad de sus propios endpoints, filtrados por lead.
 */
definePageMeta({ layout: 'admin', middleware: 'admin' })
const route = useRoute()
const toast = useToast()
const { canWrite } = useAdminPermissions()
const canEdit = computed(() => canWrite('crm'))
const leadId = Number(route.params.id)

const { data, refresh } = await useFetch<any>(`/api/admin/leads/${leadId}`)
if (!data.value) throw createError({ statusCode: 404, statusMessage: 'Lead no encontrado' })
const lead = computed<any>(() => data.value.row)
useHead({ title: () => `${lead.value?.name || 'Lead'} — Leads` })

const SLA_LABELS: Record<string, string> = { unattended: 'Sin atender', qualified_no_action: 'Cualificado sin próxima acción', inactive: 'Sin contacto' }

const tab = ref<string>(typeof route.query.tab === 'string' ? route.query.tab : 'datos')
const notesCount = ref(0)
const tasks = ref<any[]>([])
const offers = ref<any[]>([])
const activityKey = ref(0)
const tabs = computed(() => [
  { key: 'datos', label: 'Datos' },
  { key: 'historial', label: 'Historial de fases', count: data.value?.stageHistory?.length },
  { key: 'asignaciones', label: 'Asignaciones', count: data.value?.assignmentHistory?.length },
  { key: 'notas', label: 'Notas', count: notesCount.value },
  { key: 'tareas', label: 'Tareas', count: tasks.value.length },
  { key: 'actividad', label: 'Actividad' },
  { key: 'visitas', label: 'Visitas', count: data.value?.visits?.length },
  { key: 'ofertas', label: 'Ofertas', count: offers.value.length },
  { key: 'comunicaciones', label: 'Comunicaciones', count: data.value?.conversations?.length },
])

const milestones = computed(() => [
  { key: 'created', label: 'Entrada', value: lead.value.createdAt },
  { key: 'first-contact', label: 'Primer contacto', value: lead.value.firstContactAt },
  { key: 'first-response', label: 'Primera respuesta humana', value: lead.value.firstResponseAt },
  { key: 'qualified', label: 'Cualificado', value: lead.value.qualifiedAt },
  { key: 'appointment', label: 'Primera cita', value: lead.value.firstAppointmentAt },
  { key: 'converted', label: 'Convertido en contacto', value: lead.value.convertedAt },
  { key: 'last-contact', label: 'Último contacto', value: lead.value.lastContactAt },
  { key: 'next-action', label: 'Próxima acción', value: lead.value.nextActionAt },
])

const dataFields = computed(() => {
  const l = lead.value
  return [
    { label: 'Email', value: l.email },
    { label: 'Teléfono', value: l.phone },
    { label: 'WhatsApp', value: l.whatsapp },
    { label: 'Idioma', value: l.language ? LANGUAGE_LABELS[l.language] || l.language : null },
    { label: 'Origen', value: leadSourceLabel(l.source) },
    { label: 'Detalle del origen', value: l.sourceDetail },
    { label: 'Portal', value: l.portal },
    { label: 'Id externo', value: l.externalId },
    { label: 'Campaña', value: l.campaign },
    { label: 'UTM', value: [l.utmSource, l.utmMedium, l.utmCampaign, l.utmContent, l.utmTerm].filter(Boolean).join(' / ') || null },
    { label: 'Página de entrada', value: l.landingPage },
    { label: 'Referrer', value: l.referrer },
    { label: 'Presupuesto', value: l.budget != null ? money(l.budget) : null },
    { label: 'Propiedad de interés', value: l.propertyName || (l.propertyId ? `#${l.propertyId}` : null) },
    { label: 'Oficina', value: data.value.officeName },
    { label: 'Equipo', value: data.value.teamName },
  ]
})

function money(n: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

async function loadRelated() {
  const [taskRes, offerRes] = await Promise.all([
    $fetch<{ rows: any[] }>('/api/admin/saas/tasks', { query: { leadId } }).catch(() => ({ rows: [] })),
    $fetch<{ rows: any[] }>('/api/admin/saas/offers', { query: { leadId } }).catch(() => ({ rows: [] })),
  ])
  tasks.value = taskRes.rows
  offers.value = offerRes.rows
  // La cronología se carga sola al montarse; tras una acción en la ficha, se recarga.
  if (relatedLoaded) activityKey.value++
  relatedLoaded = true
}
let relatedLoaded = false
onMounted(loadRelated)

// --- Fase ---------------------------------------------------------------
const stageForm = reactive({ stage: lead.value.stage as string, reason: '' })
const changingStage = ref(false)
async function changeStage() {
  changingStage.value = true
  try {
    await $fetch(`/api/admin/saas/leads/${leadId}`, { method: 'PATCH', body: { stage: stageForm.stage, reason: stageForm.reason.trim() || null } })
    stageForm.reason = ''
    toast.success('Fase cambiada')
    await Promise.all([refresh(), loadRelated()])
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo cambiar la fase')
  } finally {
    changingStage.value = false
  }
}

// --- Perdido / reactivar ----------------------------------------------
const losing = ref(false)
async function markLost(v: { lostReason: string; note: string | null }) {
  try {
    await $fetch(`/api/admin/saas/leads/${leadId}`, { method: 'PATCH', body: { lost: true, lostReason: v.lostReason, note: v.note } })
    losing.value = false
    toast.success('Lead marcado como perdido')
    await refresh()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo marcar como perdido')
  }
}
async function reactivate() {
  try {
    await $fetch(`/api/admin/saas/leads/${leadId}`, { method: 'PATCH', body: { lost: false } })
    toast.success('Lead reactivado')
    await refresh()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo reactivar')
  }
}

// --- Comercial ------------------------------------------------------------
const commercials = ref<RelationOption[]>([])
onMounted(() => loadRelationOptions('team').then((r) => (commercials.value = r)))
const assignForm = reactive({ commercialId: (lead.value.agentId ?? null) as number | null, reason: '' })
const reassigning = ref(false)
async function reassign() {
  reassigning.value = true
  try {
    await $fetch(`/api/admin/saas/leads/${leadId}/reassign`, { method: 'POST', body: { commercialId: assignForm.commercialId, reason: assignForm.reason.trim() || null } })
    assignForm.reason = ''
    toast.success('Lead reasignado')
    await refresh()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo reasignar')
  } finally {
    reassigning.value = false
  }
}

// --- Tareas ---------------------------------------------------------------
const taskTitle = ref('')
const taskDue = ref('')
async function addTask() {
  try {
    await $fetch('/api/admin/saas/tasks', { method: 'POST', body: { title: taskTitle.value.trim(), type: 'follow_up', leadId, dueAt: taskDue.value ? `${taskDue.value} 09:00:00` : null } })
    taskTitle.value = ''
    taskDue.value = ''
    await Promise.all([loadRelated(), refresh()])
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo crear la tarea')
  }
}

// --- Edición --------------------------------------------------------------
const editing = ref(false)
async function onSaved() {
  editing.value = false
  await refresh()
}
watch(
  () => lead.value?.stage,
  (s) => {
    if (s) stageForm.stage = s
  },
)
</script>
