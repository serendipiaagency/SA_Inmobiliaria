<template>
  <div v-if="loadError" class="card p-8 text-center">
    <p class="text-sm font-medium text-stone-600">{{ loadError }}</p>
    <NuxtLink to="/admin/leads" class="btn-quiet mt-4 inline-flex">Volver</NuxtLink>
  </div>

  <div v-else-if="detail">
    <div class="mb-6">
      <NuxtLink :to="`/admin/contactos/${detail.deal.buyerContactId}`" class="text-xs font-medium text-stone-400 hover:text-ink">← {{ buyerName || 'Comprador' }}</NuxtLink>
      <div class="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight">Operación #{{ detail.deal.id }}</h1>
          <p class="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-stone-500">
            <NuxtLink :to="`/admin/${detail.deal.propertyKind === 'developer' ? 'developer-properties' : 'properties'}/${detail.deal.propertyId}`" class="hover:underline">
              Inmueble #{{ detail.deal.propertyId }} ({{ detail.deal.propertyKind === 'developer' ? 'obra nueva' : '2ª mano' }})
            </NuxtLink>
            <span>· {{ money(detail.deal.agreedAmount) }}</span>
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <span class="rounded-full px-2.5 py-1 text-xs font-semibold" :class="DEAL_STATUS_CLS[detail.deal.status]">{{ dealStatusLabel(detail.deal.status) }}</span>
        </div>
      </div>
    </div>

    <!-- Pipeline de etapas -->
    <AdminPanel title="Etapa" class="mb-6">
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="s in DEAL_STAGES"
          :key="s"
          type="button"
          class="rounded-lg border px-3 py-1.5 text-xs font-medium transition"
          :class="s === detail.deal.stage ? 'border-ink bg-ink text-white' : 'border-line hover:bg-stone-50'"
          :disabled="detail.deal.status !== 'active' || movingStage"
          @click="s === 'closed' ? closeDeal() : moveStage(s)"
        >
          {{ dealStageLabel(s) }}
        </button>
      </div>
      <div v-if="detail.deal.status === 'active'" class="mt-4 flex justify-end">
        <button type="button" class="btn-quiet !px-2.5 !py-1 text-xs text-red-600" @click="promptCancel">Cancelar operación</button>
      </div>
      <p v-if="detail.deal.status === 'cancelled'" class="mt-3 text-xs text-stone-500">Cancelada{{ detail.deal.cancelReason ? `: ${detail.deal.cancelReason}` : '' }} — {{ formatDateTime(detail.deal.cancelledAt) }}</p>
      <p v-if="detail.deal.status === 'closed'" class="mt-3 text-xs text-stone-500">Cerrada el {{ formatDateTime(detail.deal.closedAt) }}</p>
    </AdminPanel>

    <div class="grid gap-6 lg:grid-cols-3">
      <div class="space-y-6 lg:col-span-2">
        <AdminPanel title="Timeline">
          <p v-if="!detail.stageHistory.length" class="py-6 text-center text-sm text-stone-400">Sin movimientos todavía.</p>
          <ul v-else class="space-y-3">
            <li v-for="h in [...detail.stageHistory].reverse()" :key="h.id" class="border-l-2 border-line pl-3 text-[13px]">
              <p class="font-medium text-ink">{{ h.fromStage ? `${dealStageLabel(h.fromStage)} → ${dealStageLabel(h.toStage)}` : `Creada — ${dealStageLabel(h.toStage)}` }}</p>
              <p class="text-[11px] text-stone-400">{{ formatDateTime(h.createdAt) }}<template v-if="h.reason"> · {{ h.reason }}</template></p>
            </li>
          </ul>
        </AdminPanel>

        <AdminPanel title="Tareas">
          <template #action>
            <button type="button" class="btn-quiet !px-2.5 !py-1 text-xs" @click="openNewTask">+ Nueva tarea</button>
          </template>
          <p v-if="!detail.tasks.length" class="py-6 text-center text-sm text-stone-400">Sin tareas todavía.</p>
          <ul v-else class="divide-y divide-line">
            <li v-for="t in detail.tasks" :key="t.id" class="flex items-center justify-between gap-3 py-2.5">
              <div class="min-w-0">
                <p class="truncate text-[13px] font-medium text-ink">{{ t.title }}</p>
                <p class="text-[11px] text-stone-400">{{ agentName(t.assigneeId) || 'Sin asignar' }}<template v-if="t.dueAt"> · vence {{ formatRelative(t.dueAt) }}</template></p>
              </div>
              <button v-if="t.status === 'open' || t.status === 'in_progress'" type="button" class="btn-quiet !px-2 !py-1 text-[11px] shrink-0" @click="completeTask(t)">Completar</button>
              <span v-else class="shrink-0 text-[11px] text-stone-400">{{ t.status === 'completed' ? 'Completada' : 'Cancelada' }}</span>
            </li>
          </ul>
        </AdminPanel>

        <AdminPanel title="Citas" sub="Notaría, firma y cualquier otra — aparecen también en Calendar.">
          <template #action>
            <button type="button" class="btn-quiet !px-2.5 !py-1 text-xs" @click="openNewAppointment">+ Cita</button>
          </template>
          <p v-if="!detail.appointments.length" class="py-6 text-center text-sm text-stone-400">Sin citas todavía.</p>
          <ul v-else class="divide-y divide-line">
            <li v-for="v in detail.appointments" :key="v.id" class="py-2.5 text-[13px]">
              <p class="font-medium text-ink">{{ appointmentTypeLabel(v.type) }} — {{ formatDateTime(v.scheduledAt) }}</p>
              <p class="text-[11px] text-stone-400">{{ v.agentName }} · {{ v.status }}</p>
            </li>
          </ul>
        </AdminPanel>
      </div>

      <div class="space-y-6">
        <AdminPanel title="Partes">
          <dl class="space-y-3 text-sm">
            <div>
              <dt class="text-xs text-stone-400">Comprador</dt>
              <dd><NuxtLink :to="`/admin/contactos/${detail.deal.buyerContactId}`" class="hover:underline">{{ buyerName || `Contacto #${detail.deal.buyerContactId}` }}</NuxtLink></dd>
            </div>
            <div v-if="detail.sellerContactIds.length">
              <dt class="text-xs text-stone-400">Vendedor{{ detail.sellerContactIds.length > 1 ? 'es' : '' }}</dt>
              <dd v-for="sid in detail.sellerContactIds" :key="sid"><NuxtLink :to="`/admin/contactos/${sid}`" class="hover:underline">{{ sellerNames[sid] || `Contacto #${sid}` }}</NuxtLink></dd>
            </div>
            <div>
              <dt class="text-xs text-stone-400">Comercial</dt>
              <dd>{{ agentName(detail.deal.commercialId) || '—' }}</dd>
            </div>
            <div>
              <dt class="text-xs text-stone-400">Oferta aceptada</dt>
              <dd>#{{ detail.deal.acceptedOfferId }}</dd>
            </div>
            <div v-if="detail.nextAction">
              <dt class="text-xs text-stone-400">Próxima acción</dt>
              <dd>{{ formatRelative(detail.nextAction.at) }}</dd>
            </div>
          </dl>
        </AdminPanel>
      </div>
    </div>

    <!-- FASE 29 §142 — la relación Deal↔Conversation se deriva del comprador
         (sus leads/clientes), no se guarda en la operación. -->
    <section v-if="buyerCommunications" class="mt-6" data-testid="deal-communications">
      <h2 class="mb-3 text-sm font-semibold text-ink">Comunicaciones con el comprador</h2>
      <AdminCommsRelatedCommunications :conversations="buyerCommunications.conversations" :calls="buyerCommunications.calls" :emails="buyerCommunications.emails" />
    </section>

    <!-- Nueva tarea -->
    <div v-if="newTask" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="newTask = false">
      <div class="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h3 class="mb-4 text-sm font-semibold">Nueva tarea</h3>
        <div class="space-y-3">
          <input v-model="taskForm.title" type="text" placeholder="Título" class="input" >
          <select v-model="taskForm.assigneeId" class="input">
            <option value="">Sin asignar</option>
            <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
          <input v-model="taskForm.dueAt" type="datetime-local" class="input" >
        </div>
        <p v-if="taskError" class="mt-3 text-sm font-medium text-red-600">{{ taskError }}</p>
        <div class="mt-4 flex justify-end gap-2">
          <button class="btn-secondary" @click="newTask = false">Cancelar</button>
          <button class="btn-primary" :disabled="!taskForm.title.trim() || savingTask" @click="submitNewTask">{{ savingTask ? 'Guardando…' : 'Crear tarea' }}</button>
        </div>
      </div>
    </div>

    <!-- Nueva cita -->
    <div v-if="newAppointment" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="newAppointment = false">
      <div class="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h3 class="mb-4 text-sm font-semibold">Nueva cita</h3>
        <div class="space-y-3">
          <select v-model="apptForm.type" class="input">
            <option value="notary">Notaría/Firma</option>
            <option value="call">Llamada</option>
            <option value="other">Otro</option>
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
import { formatDateTime, formatRelative } from '~/composables/useClientConfig'

/**
 * Ficha de la Operación (FASE 24) — property/buyer/sellers/importe
 * acordado, control de etapa, timeline, tareas y citas. Documentos/Notas no
 * están aquí: este proyecto no tiene una infraestructura transversal de
 * Document/Note que reutilizar (auditado), e inventar una sólo para esta
 * ficha sería justo la "tab falsa" que el encargo prohíbe (§116) — ver
 * docs/deals.md.
 */
definePageMeta({ layout: 'admin', middleware: 'admin' })

const route = useRoute()
const id = route.params.id as string
const toast = useToast()

const DEAL_STAGES = ['accepted_offer', 'reservation', 'deposit_contract', 'financing', 'documentation', 'notary', 'signature', 'closed'] as const
const DEAL_STAGE_LABELS: Record<string, string> = {
  accepted_offer: 'Oferta aceptada',
  reservation: 'Reserva',
  deposit_contract: 'Arras',
  financing: 'Financiación',
  documentation: 'Documentación',
  notary: 'Notaría',
  signature: 'Firma',
  closed: 'Cerrada',
}
const DEAL_STATUS_LABELS: Record<string, string> = { active: 'Activa', closed: 'Cerrada', cancelled: 'Cancelada' }
const DEAL_STATUS_CLS: Record<string, string> = { active: 'bg-blue-50 text-blue-700', closed: 'bg-emerald-50 text-emerald-700', cancelled: 'bg-stone-100 text-stone-500' }
function dealStageLabel(s: string) { return DEAL_STAGE_LABELS[s] || s }
function dealStatusLabel(s: string) { return DEAL_STATUS_LABELS[s] || s }
function appointmentTypeLabel(t: string) { return { property_viewing: 'Visita a inmueble', call: 'Llamada', notary: 'Notaría/Firma', other: 'Otro' }[t] || t }
function money(n: number) { return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n) }

const loadError = ref('')
const { data: detail, refresh } = await useFetch<any>('/api/admin/saas/deal-operations', {
  query: { id },
  onResponseError({ response }) {
    loadError.value = response.status === 404 ? 'Esta operación no existe, o no pertenece a tu inmobiliaria.' : 'No se pudo cargar la operación.'
  },
})

useHead({ title: () => (detail.value ? `Operación #${detail.value.deal.id} — CRM` : 'Operación') })

const { data: agentsData } = await useFetch<any>('/api/admin/saas/agents')
const agents = computed<any[]>(() => agentsData.value?.rows || [])
function agentName(agentId: number | null) {
  return agents.value.find((a) => a.id === agentId)?.name || ''
}

// GET /api/admin/saas/contacts/:id devuelve { contact, leads, clients, communications, ... }.
const buyerName = ref('')
const buyerCommunications = ref<any>(null)
const sellerNames = ref<Record<number, string>>({})
watchEffect(async () => {
  if (!detail.value) return
  const buyer = await $fetch<any>(`/api/admin/saas/contacts/${detail.value.deal.buyerContactId}`).catch(() => null)
  buyerName.value = buyer?.contact?.name || ''
  buyerCommunications.value = buyer?.communications ?? null
  for (const sid of detail.value.sellerContactIds) {
    if (sellerNames.value[sid]) continue
    const seller = await $fetch<any>(`/api/admin/saas/contacts/${sid}`).catch(() => null)
    if (seller?.contact?.name) sellerNames.value[sid] = seller.contact.name
  }
})

const movingStage = ref(false)
async function moveStage(stage: string) {
  movingStage.value = true
  try {
    await $fetch('/api/admin/saas/deal-operations', { method: 'POST', body: { id: Number(id), action: 'stage', toStage: stage } })
    await refresh()
    toast.success('Etapa actualizada')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo cambiar de etapa')
  } finally {
    movingStage.value = false
  }
}
async function closeDeal() {
  try {
    await $fetch('/api/admin/saas/deal-operations', { method: 'POST', body: { id: Number(id), action: 'close' } })
    await refresh()
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
    await refresh()
    toast.success('Operación cancelada')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo cancelar la operación')
  }
}

const newTask = ref(false)
const taskForm = reactive({ title: '', assigneeId: '' as string | number, dueAt: '' })
const taskError = ref('')
const savingTask = ref(false)
function openNewTask() {
  taskForm.title = ''
  taskForm.assigneeId = detail.value?.deal.commercialId || ''
  taskForm.dueAt = ''
  taskError.value = ''
  newTask.value = true
}
async function submitNewTask() {
  if (!taskForm.title.trim()) return
  savingTask.value = true
  taskError.value = ''
  try {
    await $fetch('/api/admin/saas/tasks', {
      method: 'POST',
      body: {
        type: 'other',
        title: taskForm.title.trim(),
        assigneeId: taskForm.assigneeId || null,
        dueAt: taskForm.dueAt ? taskForm.dueAt.replace('T', ' ') + ':00' : null,
        dealId: Number(id),
        contactId: detail.value?.deal.buyerContactId,
      },
    })
    newTask.value = false
    await refresh()
    toast.success('Tarea creada')
  } catch (e: any) {
    taskError.value = e?.data?.statusMessage || 'No se pudo crear la tarea'
  } finally {
    savingTask.value = false
  }
}
async function completeTask(t: any) {
  try {
    await $fetch(`/api/admin/saas/tasks/${t.id}`, { method: 'PATCH', body: { status: 'completed' } })
    await refresh()
    toast.success('Tarea completada')
  } catch {
    toast.error('No se pudo completar la tarea')
  }
}

const newAppointment = ref(false)
const apptForm = reactive({ type: 'notary', agentId: '' as string | number, scheduledAt: '' })
const apptError = ref('')
const savingAppt = ref(false)
function openNewAppointment() {
  apptForm.type = 'notary'
  apptForm.agentId = detail.value?.deal.commercialId || ''
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
        clientName: buyerName.value || `Comprador #${detail.value?.deal.buyerContactId}`,
        agentId: apptForm.agentId,
        scheduledAt: apptForm.scheduledAt.replace('T', ' ') + ':00',
        type: apptForm.type,
        propertyId: detail.value?.deal.propertyId,
        propertyKind: detail.value?.deal.propertyKind,
        leadId: detail.value?.deal.leadId,
        dealId: Number(id),
      },
    })
    newAppointment.value = false
    await refresh()
    toast.success('Cita creada')
  } catch (e: any) {
    apptError.value = e?.data?.statusMessage || 'No se pudo crear la cita'
  } finally {
    savingAppt.value = false
  }
}
</script>
