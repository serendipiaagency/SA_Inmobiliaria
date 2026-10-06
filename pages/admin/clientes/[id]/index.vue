<template>
  <div v-if="loadError" class="card p-8 text-center">
    <p class="text-sm font-medium text-stone-600">{{ loadError }}</p>
    <NuxtLink to="/admin/clientes" class="btn-quiet mt-4 inline-flex">Volver a Clientes</NuxtLink>
  </div>

  <div v-else-if="client">
    <!-- Cabecera -->
    <div class="mb-6">
      <NuxtLink to="/admin/clientes" class="text-xs font-medium text-stone-400 hover:text-ink">← Clientes</NuxtLink>
      <div class="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div class="flex min-w-0 items-center gap-4">
          <span class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-paper text-lg font-semibold text-stone-500 ring-1 ring-line">
            {{ initials(client.name) }}
          </span>
          <div class="min-w-0">
            <h1 class="truncate text-2xl font-semibold tracking-tight">{{ client.name }}</h1>
            <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
              <ClientBadge :value="client.stage" kind="stage" />
              <ClientBadge :value="client.type" kind="type" />
            </div>
            <p class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-stone-500">
              <a v-if="client.email" :href="`mailto:${client.email}`" class="hover:text-ink hover:underline">{{ client.email }}</a>
              <a v-if="client.phone" :href="`tel:${client.phone}`" class="hover:text-ink hover:underline">{{ client.phone }}</a>
              <span v-if="client.agentName">Comercial: <span class="font-medium text-stone-700">{{ client.agentName }}</span></span>
              <span>Alta: {{ formatDate(client.createdAt) }}</span>
            </p>
          </div>
        </div>

        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <AdminCommsContactActions :client-id="Number(id)" :phone="client.phone" :name="client.name" />
          <NuxtLink :to="`/admin/clientes/${id}/editar`" class="btn-primary">Editar cliente</NuxtLink>
          <ClientRowMenu :client="{ id: Number(id), name: client.name }" @deleted="navigateTo('/admin/clientes')" />
        </div>
      </div>
    </div>

    <!-- Navegación -->
    <div class="mb-6 flex flex-wrap gap-1 border-b border-line">
      <button
        v-for="t in tabs"
        :key="t.key"
        type="button"
        class="-mb-px border-b-2 px-4 py-2.5 text-[13px] font-medium transition"
        :class="tab === t.key ? 'border-ink text-ink' : 'border-transparent text-stone-500 hover:text-ink'"
        @click="tab = t.key"
      >
        {{ t.label }}
        <span v-if="t.count" class="ml-1.5 rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-500">{{ t.count }}</span>
      </button>
    </div>

    <!-- RESUMEN -->
    <div v-show="tab === 'resumen'" class="grid gap-6 lg:grid-cols-3">
      <div class="space-y-6 lg:col-span-2">
        <div class="grid gap-4 sm:grid-cols-3">
          <AdminStatCard label="Visitas" :value="dt.num(totals.visits)" :sub="`${totals.visitsCompleted} completadas`" />
          <AdminStatCard label="Operaciones cerradas" :value="dt.num(totals.deals)" />
          <AdminStatCard label="Volumen cerrado" :value="dt.money(totals.dealsVolume, { compact: true })" />
        </div>

        <AdminPanel title="Propiedades relacionadas" :sub="related?.properties?.length ? 'Se leen en vivo del catálogo: si cambia el precio o la foto, cambia aquí.' : undefined">
          <div v-if="!related?.properties?.length" class="py-8 text-center text-sm text-stone-400">
            Todavía no hay propiedades vinculadas a este cliente.
          </div>
          <div v-else class="grid gap-4 sm:grid-cols-2">
            <ClientPropertyCard v-for="p in related.properties.slice(0, 4)" :key="`${p.resource}-${p.id}`" :property="p" />
          </div>
          <button v-if="(related?.properties?.length || 0) > 4" type="button" class="btn-quiet mt-4 w-full !py-2 !text-[12px]" @click="tab = 'propiedades'">
            Ver las {{ related.properties.length }} propiedades
          </button>
        </AdminPanel>

        <AdminPanel title="Actividad reciente">
          <ClientTimeline :events="timeline.slice(0, 6)" />
          <button v-if="timeline.length > 6" type="button" class="btn-quiet mt-4 w-full !py-2 !text-[12px]" @click="tab = 'actividad'">
            Ver toda la actividad
          </button>
        </AdminPanel>
      </div>

      <div class="space-y-6">
        <AdminPanel title="Datos principales">
          <dl class="space-y-3 text-sm">
            <ClientField label="Email" :value="client.email" />
            <ClientField label="Teléfono" :value="client.phone" />
            <ClientField label="Ubicación" :value="client.location" />
            <ClientField label="Comercial responsable" :value="client.agentName" />
            <ClientField label="Alta" :value="formatDate(client.createdAt)" />
            <ClientField label="Última actividad" :value="totals.lastActivityAt ? formatRelative(totals.lastActivityAt) : null" />
          </dl>
        </AdminPanel>

        <AdminPanel v-if="client.notes" title="Notas">
          <p class="whitespace-pre-line text-[13px] leading-relaxed text-stone-600">{{ client.notes }}</p>
        </AdminPanel>

        <AdminPanel title="Cómo se relaciona" sub="Para que sepas de dónde sale lo de arriba.">
          <p class="text-[12px] leading-relaxed text-stone-500">
            El histórico se cruza por
            <span v-if="related?.matchedBy?.email" class="font-medium text-stone-700">email ({{ related.matchedBy.email }})</span>
            <span v-else class="font-medium text-stone-700">nombre exacto</span>
            porque el modelo no guarda todavía un vínculo directo entre un cliente y sus visitas u operaciones.
            <span v-if="!related?.matchedBy?.email">Añadirle un email hace el cruce mucho más fiable.</span>
          </p>
        </AdminPanel>
      </div>
    </div>

    <!-- INFORMACIÓN -->
    <div v-show="tab === 'informacion'" data-testid="client-tab-informacion" class="grid gap-6 lg:grid-cols-2">
      <AdminPanel title="Datos personales">
        <dl class="space-y-3 text-sm">
          <ClientField label="Nombre completo" :value="client.name" />
          <ClientField label="Email" :value="client.email" />
          <ClientField label="Teléfono" :value="client.phone" />
        </dl>
      </AdminPanel>

      <AdminPanel title="Información comercial">
        <dl class="space-y-3 text-sm">
          <ClientField label="Tipo de cliente" :value="clientOption('type', client.type).label" />
          <ClientField label="Estado" :value="clientOption('stage', client.stage).label" />
          <ClientField label="Comercial responsable" :value="client.agentName" />
          <ClientField label="Ubicación" :value="client.location" />
          <ClientField label="Alta" :value="formatDate(client.createdAt)" />
          <ClientField label="Última modificación" :value="formatDateTime(client.updatedAt)" />
        </dl>
      </AdminPanel>

      <AdminPanel title="Notas" class="lg:col-span-2">
        <p v-if="client.notes" class="whitespace-pre-line text-[13px] leading-relaxed text-stone-600">{{ client.notes }}</p>
        <p v-else class="text-sm text-stone-400">Sin notas.</p>
      </AdminPanel>

      <AdminPanel title="Campos que este modelo todavía no guarda" class="lg:col-span-2">
        <p class="text-[13px] leading-relaxed text-stone-500">
          La tabla de clientes no tiene fotografía, apellidos separados, documento de identidad, fecha de nacimiento,
          idioma, WhatsApp, dirección estructurada, oficina, origen ni etiquetas. No se muestran campos vacíos que
          aparenten existir: añadirlos es una migración de base de datos.
        </p>
      </AdminPanel>
    </div>

    <!-- PROPIEDADES -->
    <div v-show="tab === 'propiedades'">
      <div v-if="!related?.properties?.length" class="card px-4 py-16 text-center">
        <p class="text-sm font-medium text-stone-500">Sin propiedades relacionadas</p>
        <p class="mt-1 text-xs text-stone-400">Aparecerán aquí en cuanto este cliente tenga una visita, una reserva, un lead o una operación sobre una propiedad.</p>
      </div>
      <template v-else>
        <p class="mb-4 text-[13px] text-stone-500">
          {{ related.properties.length }} propiedad{{ related.properties.length === 1 ? '' : 'es' }}, agrupadas por el motivo de la relación.
          Los datos se leen del catálogo en vivo — esta ficha no guarda copia de ninguno.
        </p>
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <ClientPropertyCard v-for="p in related.properties" :key="`${p.resource}-${p.id}`" :property="p" />
        </div>
      </template>
    </div>

    <!-- ACTIVIDAD -->
    <div v-show="tab === 'actividad'">
      <AdminPanel title="Histórico" sub="Sólo hechos registrados: visitas, operaciones, reservas, contratos, leads, mensajes de WhatsApp, llamadas y cambios hechos desde el panel.">
        <ClientTimeline :events="timeline" />
      </AdminPanel>
    </div>

    <!-- TAREAS -->
    <div v-show="tab === 'tareas'" data-testid="client-tab-tareas">
      <AdminPanel title="Tareas" sub="Trabajo pendiente sobre esta persona — distinto de las visitas y llamadas ya realizadas.">
        <template #action>
          <button v-if="related?.contactId" type="button" class="btn-quiet !px-2.5 !py-1 text-xs" @click="openNewTask">+ Nueva tarea</button>
        </template>
        <p v-if="!related?.contactId" class="py-6 text-center text-sm text-stone-400">
          Esta ficha no tiene un Contact moderno vinculado todavía, así que no se le pueden asignar tareas.
        </p>
        <p v-else-if="!tasks.length" class="py-8 text-center text-sm text-stone-400">Sin tareas todavía.</p>
        <ul v-else class="divide-y divide-line">
          <li v-for="t in tasks" :key="t.id" class="flex items-center justify-between gap-3 py-3">
            <div class="min-w-0">
              <p class="truncate text-[13px] font-medium text-ink">{{ taskTypeLabel(t.type) }} — {{ t.title }}</p>
              <p class="text-[11px] text-stone-400">
                {{ t.assigneeName || 'Sin asignar' }}
                <template v-if="t.dueAt"> · vence {{ formatRelative(t.dueAt) }}</template>
                <span v-if="isOverdue(t)" class="ml-1 font-medium text-red-600">vencida</span>
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-1.5">
              <span class="rounded-full px-2 py-0.5 text-[10px] font-semibold" :class="TASK_STATUS_CLS[t.status] || 'bg-stone-100 text-stone-500'">{{ taskStatusLabel(t.status) }}</span>
              <button v-if="t.status === 'open' || t.status === 'in_progress'" type="button" class="btn-quiet !px-2 !py-1 text-[11px]" @click="completeTask(t)">Completar</button>
            </div>
          </li>
        </ul>
      </AdminPanel>
    </div>

    <!-- OFERTAS -->
    <div v-show="tab === 'ofertas'" data-testid="client-tab-ofertas">
      <AdminPanel title="Ofertas" sub="Propuestas económicas sobre un inmueble — como comprador o como vendedor.">
        <template #action>
          <button v-if="related?.contactId" type="button" class="btn-quiet !px-2.5 !py-1 text-xs" @click="openNewOffer">+ Nueva oferta</button>
        </template>
        <p v-if="!related?.contactId" class="py-6 text-center text-sm text-stone-400">
          Esta ficha no tiene un Contact moderno vinculado todavía, así que no se le pueden crear ofertas.
        </p>
        <p v-else-if="!offers.length" class="py-8 text-center text-sm text-stone-400">Sin ofertas todavía.</p>
        <ul v-else class="divide-y divide-line">
          <li v-for="o in offers" :key="o.id" class="py-3">
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <NuxtLink :to="`/admin/${o.propertyKind === 'developer' ? 'developer-properties' : 'properties'}/${o.propertyId}`" class="truncate text-[13px] font-medium text-ink hover:underline">
                  Inmueble #{{ o.propertyId }} ({{ o.propertyKind === 'developer' ? 'obra nueva' : '2ª mano' }})
                </NuxtLink>
                <p class="text-[11px] text-stone-400">
                  {{ formatAmount(o.currentAmount, o.currency) }}
                  <template v-if="o.expiration"> · vence {{ formatRelative(o.expiration) }}</template>
                  <span v-if="isOfferExpired(o)" class="ml-1 font-medium text-red-600">vencida</span>
                </p>
              </div>
              <span class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" :class="OFFER_STATUS_CLS[o.status] || 'bg-stone-100 text-stone-500'">{{ offerStatusLabel(o.status) }}</span>
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-1.5">
              <button v-if="o.status === 'draft'" type="button" class="btn-quiet !px-2 !py-1 text-[11px]" @click="offerAction(o, 'submit')">Enviar</button>
              <template v-if="o.status === 'submitted' || o.status === 'countered'">
                <button type="button" class="btn-quiet !px-2 !py-1 text-[11px]" @click="openOfferId = o.id">{{ o.status === 'countered' ? 'Nueva oferta / contraoferta' : 'Contraoferta' }}</button>
                <button type="button" class="btn-quiet !px-2 !py-1 text-[11px] text-emerald-600" @click="offerAction(o, 'accept')">Aceptar</button>
                <button type="button" class="btn-quiet !px-2 !py-1 text-[11px] text-red-600" @click="offerAction(o, 'reject')">Rechazar</button>
              </template>
              <button v-if="o.status === 'draft' || o.status === 'submitted' || o.status === 'countered'" type="button" class="btn-quiet !px-2 !py-1 text-[11px] text-stone-400" @click="offerAction(o, 'withdraw')">Retirar</button>
              <button v-if="o.status === 'accepted' && !dealExistsForOffer(o.id)" type="button" class="btn-primary !px-2.5 !py-1 text-[11px]" @click="createDealFromOffer(o)">Crear operación</button>
              <NuxtLink v-else-if="o.status === 'accepted'" :to="`/admin/deal-operations/${dealExistsForOffer(o.id)}`" class="btn-quiet !px-2 !py-1 text-[11px] text-emerald-600">Ver operación →</NuxtLink>
              <button type="button" class="btn-quiet !px-2 !py-1 text-[11px] text-stone-500" @click="openOfferId = o.id">Historial</button>
            </div>
          </li>
        </ul>
      </AdminPanel>
    </div>

    <!-- OPERACIONES -->
    <div v-show="tab === 'operaciones'" data-testid="client-tab-operaciones">
      <AdminPanel title="Operaciones" sub="La operación en ejecución/cierre, una vez hay una oferta aceptada — como compradora o como vendedora.">
        <p v-if="!dealOperations.length" class="py-8 text-center text-sm text-stone-400">Sin operaciones todavía.</p>
        <ul v-else class="divide-y divide-line">
          <li v-for="d in dealOperations" :key="d.id" class="py-3">
            <NuxtLink :to="`/admin/deal-operations/${d.id}`" class="flex items-center justify-between gap-3 hover:underline">
              <div class="min-w-0">
                <p class="truncate text-[13px] font-medium text-ink">Inmueble #{{ d.propertyId }} ({{ d.propertyKind === 'developer' ? 'obra nueva' : '2ª mano' }})</p>
                <p class="text-[11px] text-stone-400">{{ formatAmount(d.agreedAmount, d.currency) }} · {{ dealStageLabel(d.stage) }}</p>
              </div>
              <span class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" :class="DEAL_STATUS_CLS[d.status] || 'bg-stone-100 text-stone-500'">{{ dealStatusLabel(d.status) }}</span>
            </NuxtLink>
          </li>
        </ul>
      </AdminPanel>
    </div>

    <!-- COMUNICACIONES -->
    <div v-show="tab === 'comunicaciones'" data-testid="client-tab-comunicaciones">
      <AdminCommsRelatedCommunications :conversations="related?.conversations" :calls="related?.calls" :emails="related?.emails" />
    </div>

    <!-- Nueva tarea -->
    <div v-if="newTask" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="newTask = false">
      <div class="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h3 class="mb-4 text-sm font-semibold">Nueva tarea</h3>
        <div class="space-y-3">
          <select v-model="taskForm.type" class="input">
            <option v-for="ty in TASK_TYPES" :key="ty" :value="ty">{{ taskTypeLabel(ty) }}</option>
          </select>
          <input v-model="taskForm.title" type="text" placeholder="Título — p.ej. «Llamar para feedback de visita»" class="input" >
          <select v-model="taskForm.assigneeId" class="input">
            <option value="">Sin asignar</option>
            <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
          <input v-model="taskForm.dueAt" type="datetime-local" class="input" >
          <select v-model="taskForm.priority" class="input">
            <option v-for="p in TASK_PRIORITIES" :key="p" :value="p">{{ taskPriorityLabel(p) }}</option>
          </select>
        </div>
        <p v-if="taskError" class="mt-3 text-sm font-medium text-red-600">{{ taskError }}</p>
        <div class="mt-4 flex justify-end gap-2">
          <button class="btn-secondary" @click="newTask = false">Cancelar</button>
          <button class="btn-primary" :disabled="!taskForm.title.trim() || savingTask" @click="submitNewTask">{{ savingTask ? 'Guardando…' : 'Crear tarea' }}</button>
        </div>
      </div>
    </div>

    <!-- Ofertas (bloque N6): alta con vendedor, financiación y vencimiento; contraoferta/nueva oferta con términos completos e historial. -->
    <OfferFormModal v-if="newOffer && related?.contactId" :fixed-buyer="{ id: related.contactId, label: client?.name || `Contacto #${related.contactId}` }" @close="newOffer = false" @saved="onOfferCreated" />
    <OfferDetailModal v-if="openOfferId" :offer-id="openOfferId" @close="openOfferId = null" @changed="refreshRelated" />
  </div>

  <div v-else class="card px-4 py-20 text-center text-sm text-stone-400">Cargando…</div>
</template>

<script setup lang="ts">
import ClientBadge from '~/components/client-builder/ClientBadge.vue'
import ClientField from '~/components/client-builder/ClientField.vue'
import ClientPropertyCard from '~/components/client-builder/ClientPropertyCard.vue'
import ClientRowMenu from '~/components/client-builder/ClientRowMenu.vue'
import ClientTimeline from '~/components/client-builder/ClientTimeline.vue'
import OfferFormModal from '~/components/admin/offers/OfferFormModal.vue'
import OfferDetailModal from '~/components/admin/offers/OfferDetailModal.vue'
import { buildClientTimeline } from '~/composables/useClientTimeline'
import { formatAmount } from '~/utils/pipelineCatalog'
import { clientOption, formatDate, formatDateTime, formatRelative, initials } from '~/composables/useClientConfig'

/**
 * La ficha 360º de un cliente.
 *
 * Todo lo que enseña viene de tablas reales. No hay pestaña de Documentos
 * porque **no existe una tabla de documentos de cliente** (sí la hay para
 * comerciales, `team_member_documents`): inventarla aquí sería una migración,
 * no una pantalla. Tampoco hay métricas de relleno.
 */
definePageMeta({ layout: 'admin', middleware: 'admin' })

const route = useRoute()
const id = route.params.id as string
const dt = useDash()

const tab = ref<'resumen' | 'informacion' | 'propiedades' | 'actividad' | 'tareas' | 'ofertas' | 'operaciones' | 'comunicaciones'>('resumen')
const loadError = ref('')

const { data: clientRes } = await useFetch<any>(`/api/admin/clients/${id}`, {
  onResponseError({ response }) {
    loadError.value = response.status === 404 ? 'Este cliente no existe, o no pertenece a tu inmobiliaria.' : 'No se pudo cargar el cliente.'
  },
})
const client = computed(() => clientRes.value?.row || null)

const { data: related, refresh: refreshRelated } = await useFetch<any>(`/api/admin/clients/${id}/related`, { default: () => null })
const toast = useToast()

// --- Tareas (FASE 22) -------------------------------------------------------
const TASK_TYPES = ['call', 'whatsapp', 'email', 'follow_up', 'document', 'viewing', 'offer', 'signature', 'other'] as const
const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const
const TASK_TYPE_LABELS: Record<string, string> = { call: 'Llamada', whatsapp: 'WhatsApp', email: 'Email', follow_up: 'Seguimiento', document: 'Documento', viewing: 'Visita', offer: 'Oferta', signature: 'Firma', other: 'Otro' }
const TASK_PRIORITY_LABELS: Record<string, string> = { low: 'Baja', medium: 'Media', high: 'Alta', urgent: 'Urgente' }
const TASK_STATUS_LABELS: Record<string, string> = { open: 'Abierta', in_progress: 'En curso', completed: 'Completada', cancelled: 'Cancelada' }
const TASK_STATUS_CLS: Record<string, string> = { open: 'bg-blue-50 text-blue-700', in_progress: 'bg-amber-50 text-amber-700', completed: 'bg-emerald-50 text-emerald-700', cancelled: 'bg-stone-100 text-stone-500' }
function taskTypeLabel(t: string) { return TASK_TYPE_LABELS[t] || t }
function taskPriorityLabel(p: string) { return TASK_PRIORITY_LABELS[p] || p }
function taskStatusLabel(s: string) { return TASK_STATUS_LABELS[s] || s }
function isOverdue(t: any) { return (t.status === 'open' || t.status === 'in_progress') && t.dueAt && t.dueAt < new Date().toISOString().replace('T', ' ').slice(0, 19) }

const tasks = computed<any[]>(() => related.value?.tasks || [])
const { data: agentsData } = await useFetch<any>('/api/admin/saas/agents')
const agents = computed<any[]>(() => agentsData.value?.rows || [])

const newTask = ref(false)
const taskForm = reactive({ type: 'call' as string, title: '', assigneeId: '' as string | number, dueAt: '', priority: 'medium' as string })
const taskError = ref('')
const savingTask = ref(false)
function openNewTask() {
  taskForm.type = 'call'
  taskForm.title = ''
  taskForm.assigneeId = agents.value.find((a) => a.name === client.value?.agentName)?.id || ''
  taskForm.dueAt = ''
  taskForm.priority = 'medium'
  taskError.value = ''
  newTask.value = true
}
async function submitNewTask() {
  if (!taskForm.title.trim() || !related.value?.contactId) return
  savingTask.value = true
  taskError.value = ''
  try {
    await $fetch('/api/admin/saas/tasks', {
      method: 'POST',
      body: {
        type: taskForm.type,
        title: taskForm.title.trim(),
        assigneeId: taskForm.assigneeId || null,
        dueAt: taskForm.dueAt ? taskForm.dueAt.replace('T', ' ') + ':00' : null,
        priority: taskForm.priority,
        contactId: related.value.contactId,
      },
    })
    newTask.value = false
    await refreshRelated()
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
    t.status = 'completed'
    toast.success('Tarea completada')
  } catch {
    toast.error('No se pudo completar la tarea')
  }
}

// --- Ofertas (FASE 23) -------------------------------------------------------
const offers = computed<any[]>(() => related.value?.offers || [])
const OFFER_STATUS_LABELS: Record<string, string> = { draft: 'Borrador', submitted: 'Enviada', countered: 'Contraoferta', accepted: 'Aceptada', rejected: 'Rechazada', withdrawn: 'Retirada', expired: 'Vencida' }
const OFFER_STATUS_CLS: Record<string, string> = {
  draft: 'bg-stone-100 text-stone-500',
  submitted: 'bg-blue-50 text-blue-700',
  countered: 'bg-amber-50 text-amber-700',
  accepted: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-700',
  withdrawn: 'bg-stone-100 text-stone-500',
  expired: 'bg-stone-100 text-stone-500',
}
function offerStatusLabel(s: string) { return OFFER_STATUS_LABELS[s] || s }
function isOfferExpired(o: any) { return (o.status === 'submitted' || o.status === 'countered') && o.expiration && o.expiration < new Date().toISOString().replace('T', ' ').slice(0, 19) }

async function offerAction(o: any, action: 'submit' | 'accept' | 'reject' | 'withdraw') {
  try {
    const updated = await $fetch<any>(`/api/admin/saas/offers/${o.id}/${action}`, { method: 'POST', body: {} })
    Object.assign(o, updated)
    toast.success('Oferta actualizada')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo actualizar la oferta')
  }
}

// Contraoferta, nueva oferta e historial: el detalle compartido (components/admin/offers), con los términos completos.
const openOfferId = ref<number | null>(null)
const newOffer = ref(false)
function openNewOffer() {
  newOffer.value = true
}
async function onOfferCreated(offer: any) {
  newOffer.value = false
  await refreshRelated()
  toast.success('Oferta creada en borrador')
  openOfferId.value = offer.id
}

// --- Operaciones (FASE 24) ---------------------------------------------------
const dealOperations = computed<any[]>(() => related.value?.dealOperations || [])
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
function dealExistsForOffer(offerId: number): number | null {
  return dealOperations.value.find((d) => d.acceptedOfferId === offerId)?.id ?? null
}
async function createDealFromOffer(o: any) {
  try {
    const deal = await $fetch<any>('/api/admin/saas/deal-operations', { method: 'POST', body: { acceptedOfferId: o.id } })
    toast.success('Operación creada')
    await navigateTo(`/admin/deal-operations/${deal.id}`)
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo crear la operación')
  }
}

useHead({ title: () => (client.value?.name ? `${client.value.name} — Clientes` : 'Cliente') })

const totals = computed(
  () => related.value?.totals || { visits: 0, visitsCompleted: 0, deals: 0, dealsVolume: 0, lastActivityAt: null },
)
const timeline = computed(() => (related.value ? buildClientTimeline(related.value) : []))

const tabs = computed(() => [
  { key: 'resumen' as const, label: 'Resumen', count: 0 },
  { key: 'informacion' as const, label: 'Información', count: 0 },
  { key: 'propiedades' as const, label: 'Propiedades', count: related.value?.properties?.length || 0 },
  { key: 'actividad' as const, label: 'Actividad', count: timeline.value.length },
  { key: 'tareas' as const, label: 'Tareas', count: tasks.value.length },
  { key: 'ofertas' as const, label: 'Ofertas', count: offers.value.length },
  { key: 'operaciones' as const, label: 'Operaciones', count: dealOperations.value.length },
  { key: 'comunicaciones' as const, label: 'Comunicaciones', count: (related.value?.conversations?.length || 0) + (related.value?.calls?.length || 0) + (related.value?.emails?.length || 0) },
])
</script>
