<template>
  <div>
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Leads</h1>
        <p class="mt-1 text-sm text-stone-500">{{ pipelineTotal }} leads · arrastra una tarjeta para cambiar su estado</p>
      </div>
      <div class="flex items-center gap-2">
        <button v-if="canEdit" type="button" class="btn-primary" data-testid="lead-new" @click="creating = true">+ Nuevo lead</button>
        <div class="flex gap-1 rounded-lg bg-stone-100 p-0.5">
          <button class="rounded-md px-3 py-1.5 text-xs font-medium transition" :class="view === 'board' ? 'bg-white text-ink shadow-sm' : 'text-stone-500'" @click="view = 'board'">Pipeline</button>
          <button class="rounded-md px-3 py-1.5 text-xs font-medium transition" :class="view === 'table' ? 'bg-white text-ink shadow-sm' : 'text-stone-500'" @click="view = 'table'">Tabla</button>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <div class="relative">
        <svg class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
        <input v-model="search" type="search" placeholder="Buscar por nombre, email o propiedad…" class="w-64 rounded-lg border border-line bg-white py-2 pl-9 pr-3 text-sm focus:border-ink" >
      </div>
      <select v-model="source" class="rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink">
        <option value="all">Todos los orígenes</option>
        <option v-for="s in LEAD_SOURCES" :key="s" :value="s">{{ LEAD_SOURCE_LABELS[s] }}</option>
      </select>
      <select v-model="officeId" class="rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink" data-testid="leads-office-filter">
        <option value="">Todas las oficinas</option>
        <option v-for="o in offices" :key="o.id" :value="String(o.id)">{{ o.label }}</option>
      </select>
      <select v-model="priority" class="rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink" data-testid="leads-priority-filter">
        <option value="">Cualquier prioridad</option>
        <option v-for="p in LEAD_PRIORITIES" :key="p" :value="p">{{ LEAD_PRIORITY_LABELS[p] }}</option>
      </select>
      <button v-if="Object.keys(drill).length" type="button" class="rounded-full bg-ink px-3 py-1 text-xs font-medium text-white" data-testid="leads-drill-chip" @click="clearDrill">
        {{ drill.ids ? 'Lead abierto desde INMO' : 'Filtrado desde el dashboard' }} · quitar ✕
      </button>
      <!-- FASE 32 §74 — ordenar y filtrar por Lead Score -->
      <select v-model="scoreMin" class="rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink" data-testid="leads-score-min">
        <option value="">Cualquier puntuación</option>
        <option value="25">Puntuación ≥ 25</option>
        <option value="50">Puntuación ≥ 50</option>
        <option value="75">Puntuación ≥ 75</option>
      </select>
      <select v-model="sort" class="rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink" data-testid="leads-sort">
        <option value="">Más recientes primero</option>
        <option value="score">Mayor puntuación primero</option>
      </select>
      <!-- Etiquetas (FASE 0, bloque N7b) -->
      <select v-model="tag" class="rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink" aria-label="Filtrar por etiqueta" data-testid="leads-tag-filter">
        <option value="">Todas las etiquetas</option>
        <option v-for="t in tagOptions" :key="t.id" :value="String(t.id)">{{ t.name }}</option>
      </select>
      <!-- Exportación completa del filtro (FASE 28, bloque N7b): todas las filas, no sólo la página. -->
      <a :href="exportAllHref" download class="rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-stone-600 hover:border-ink hover:text-ink" data-testid="leads-export-all">
        Exportar CSV ({{ total }})
      </a>
    </div>
    <p v-if="view === 'board' && total > rows.length" class="-mt-2 mb-3 text-[12px] text-stone-500" data-testid="leads-board-cap">
      El pipeline enseña los {{ rows.length }} leads más recientes de {{ total }} que cumplen el filtro. La vista Tabla los pagina todos, y «Exportar CSV» los descarga todos.
    </p>

    <!-- Board -->
    <div v-if="view === 'board'" class="flex gap-3 overflow-x-auto pb-2">
      <div
        v-for="col in columns"
        :key="col.key"
        class="flex w-72 shrink-0 flex-col rounded-xl border border-line bg-[#f7f6f4]"
        @dragover.prevent
        @drop="onDrop(col.key)"
      >
        <div class="flex items-center justify-between border-b border-line px-3.5 py-2.5">
          <span class="flex items-center gap-2 text-sm font-semibold">
            <span class="h-2 w-2 rounded-full" :style="{ background: col.dot }" />
            {{ col.label }}
          </span>
          <span class="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-stone-500">{{ (counts[col.key] || 0) }}</span>
        </div>
        <div class="flex-1 space-y-2 overflow-y-auto p-2.5" style="max-height: 62vh">
          <article
            v-for="l in byColumn(col.key)"
            :key="l.id"
            draggable="true"
            class="group cursor-grab rounded-lg border border-line bg-white p-3 shadow-sm transition hover:shadow-md active:cursor-grabbing"
            :class="dragId === l.id ? 'opacity-40' : ''"
            @dragstart="dragId = l.id"
            @dragend="dragId = null"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <NuxtLink :to="`/admin/leads/${l.id}`" class="block truncate text-sm font-semibold hover:underline" :data-testid="`lead-link-${l.id}`" title="Abrir la ficha del lead">{{ l.name }}</NuxtLink>
                <NuxtLink v-if="l.contactId" :to="`/admin/contactos/${l.contactId}?tab=comunicaciones`" class="block truncate text-[11px] text-stone-400 hover:underline" :data-testid="`lead-contact-link-${l.id}`" title="Ver el contacto y sus comunicaciones">Ver contacto</NuxtLink>
                <p class="truncate text-xs text-stone-500">{{ l.propertyName }}</p>
              </div>
              <AdminLeadScoreBadge class="shrink-0" :lead="l" compact @updated="(u) => Object.assign(l, u)" />
            </div>
            <TagChips v-if="l.tags?.length" class="mt-1.5" :tags="l.tags" />
            <div class="mt-2 flex items-center justify-between text-xs text-stone-400">
              <span>{{ leadSourceLabel(l.source) }}</span>
              <span>{{ dt.money(l.budget, { compact: true }) }}</span>
            </div>
            <p v-if="col.key === 'lost' && l.lostReason" class="mt-1 text-[11px] text-stone-400">{{ lostReasonLabel(l.lostReason) }}</p>
            <p v-if="l.nextActionAt" class="mt-1.5 text-[11px]" :class="isNextActionOverdue(l) ? 'font-medium text-red-600' : 'text-stone-400'">
              Próxima acción: {{ nextActionLabel(l.nextActionType) }} · {{ dt.relative(l.nextActionAt) }}
            </p>
            <div class="mt-2 flex items-center gap-1.5 border-t border-line pt-2 text-[11px] text-stone-500">
              <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[9px] font-semibold text-stone-600">{{ dt.initials(l.agentName) }}</span>
              <select
                class="min-w-0 flex-1 truncate rounded border-0 bg-transparent py-0 pl-0 pr-4 text-[11px] text-stone-600 focus:ring-1 focus:ring-ink"
                :value="l.agentId || ''"
                :disabled="reassigningId === l.id"
                @click.stop
                @change="reassignLead(l, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">Sin asignar</option>
                <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
              </select>
              <button type="button" class="btn-quiet !px-1.5 !py-0.5 text-[10px]" title="Nueva tarea" @click.stop="openNewTask(l)">+ Tarea</button>
              <AdminCommsContactActions v-if="l.phone" :lead-id="l.id" :phone="l.phone" :name="l.name" compact />
            </div>
          </article>
          <p v-if="!byColumn(col.key).length" class="py-6 text-center text-xs text-stone-400">Vacío</p>
        </div>
      </div>
    </div>

    <!-- Table -->
    <template v-else>
      <!-- Bulk Actions (FASE 28 incremento 3) — sólo en la vista de tabla, igual
           que PropertyList.vue no las ofrece en su cuadrícula. Con la Tabla ya
           paginada (bloque N7b), «Seleccionar los N que cumplen el filtro» deja
           que el servidor resuelva la selección completa (server/utils/leads/list.ts). -->
      <div v-if="selectionCount > 0" class="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-3">
        <span class="text-sm font-medium">{{ selectionCount }} seleccionado{{ selectionCount === 1 ? '' : 's' }}</span>
        <select v-model="bulkAction" class="input !w-52" @change="onBulkActionChange">
          <option value="">Elige una acción…</option>
          <option value="change_commercial">Cambiar comercial</option>
          <option value="change_stage">Cambiar fase</option>
          <option value="add_tag">Añadir etiqueta</option>
          <option value="create_task">Crear tarea</option>
          <option value="recalculate_score">Recalcular puntuación</option>
        </select>
        <select v-if="bulkAction === 'change_commercial'" v-model="bulkCommercialId" class="input !w-48">
          <option value="">Sin asignar</option>
          <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
        <select v-if="bulkAction === 'change_stage'" v-model="bulkStage" class="input !w-44">
          <option value="">Elige una fase…</option>
          <option v-for="c in pipelineColumns" :key="c.key" :value="c.key">{{ c.label }}</option>
        </select>
        <input v-if="bulkAction === 'add_tag'" v-model="bulkTagName" class="input !w-48" placeholder="Nombre de la etiqueta" >
        <template v-if="bulkAction === 'create_task'">
          <select v-model="bulkTaskType" class="input !w-36">
            <option value="call">Llamada</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
            <option value="follow_up">Seguimiento</option>
            <option value="viewing">Visita</option>
            <option value="other">Otro</option>
          </select>
          <input v-model="bulkTaskTitle" class="input !w-44" placeholder="Título de la tarea" >
          <select v-model="bulkTaskAssigneeId" class="input !w-44">
            <option value="">Sin asignar</option>
            <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </template>
        <button type="button" class="btn-primary !px-3 !py-1.5 text-xs" :disabled="!canRunBulkAction || bulkRunning" @click="runBulkAction">
          {{ bulkRunning ? bulkProgressLabel : 'Aplicar' }}
        </button>
        <button type="button" class="btn-quiet !px-3 !py-1.5 text-xs" :disabled="bulkRunning" @click="exportSelection">Exportar seleccionados</button>
        <button type="button" class="text-[12px] text-stone-500 hover:text-ink" :disabled="bulkRunning" @click="clearSelection">Cancelar selección</button>
      </div>

      <div v-if="allVisibleSelected && !selectAllFilteredMode && filteredTotal > rows.length" class="mb-3 text-center text-[12px] text-stone-500" data-testid="leads-select-all-filtered-hint">
        Has seleccionado los {{ rows.length }} leads de esta página.
        <button type="button" class="font-medium text-ink hover:underline" data-testid="leads-select-all-filtered" @click="selectAllFiltered">Seleccionar los {{ filteredTotal }} que cumplen el filtro</button>
      </div>
      <p v-if="selectAllFilteredMode" class="mb-3 text-center text-[12px] text-stone-500">
        Seleccionados los {{ filteredTotal }} leads que cumplen el filtro (máximo 2000 por acción).
      </p>

      <AdminPanel :pad="false">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="border-b border-line bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-400">
              <tr>
                <th class="px-4 py-2.5"><input type="checkbox" :checked="allVisibleSelected" @change="toggleSelectAllVisible" ></th>
                <th class="px-4 py-2.5 font-semibold">Lead</th>
                <th class="px-4 py-2.5 font-semibold">Origen</th>
                <th class="px-4 py-2.5 font-semibold">Fase</th>
                <th class="px-4 py-2.5 font-semibold">Estado</th>
                <th class="px-4 py-2.5 text-right font-semibold">Score</th>
                <th class="px-4 py-2.5 text-right font-semibold">Presupuesto</th>
                <th class="px-4 py-2.5 font-semibold">Comercial</th>
                <th class="px-4 py-2.5 font-semibold">Últ. contacto</th>
                <th class="px-4 py-2.5 font-semibold">Próxima acción</th>
                <th class="px-2 py-2.5 font-semibold"><span class="sr-only">Contactar</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in rows" :key="l.id" class="border-b border-line/60 last:border-0 hover:bg-stone-50">
                <td class="px-4 py-3"><input type="checkbox" :checked="isSelected(l.id)" @change="toggleSelect(l.id)" ></td>
                <td class="px-4 py-3">
                  <NuxtLink :to="`/admin/leads/${l.id}`" class="font-medium hover:underline">{{ l.name }}</NuxtLink>
                  <p class="text-xs text-stone-400">{{ l.email }}</p>
                  <TagChips v-if="l.tags?.length" class="mt-1" :tags="l.tags" />
                </td>
                <td class="px-4 py-3 text-stone-600">{{ leadSourceLabel(l.source) }}</td>
                <!-- Edición inline (cierre C1): fase y comercial desde la fila, por las mismas rutas que el Kanban. -->
                <td class="px-4 py-3 text-stone-600">
                  <AdminInlineEdit
                    type="select"
                    label="Fase"
                    :value="tableStageValue(l)"
                    :display="tableStageValue(l) === 'lost' ? 'Perdido' : stageLabel(l.stage)"
                    :options="tableStageOptions"
                    :editable="canEdit"
                    :test-id="`lead-inline-stage-${l.id}`"
                    :save="(v) => saveTableStage(l, String(v))"
                  />
                </td>
                <td class="px-4 py-3"><AdminStatusPill :status="l.status" /></td>
                <td class="px-4 py-3 text-right"><AdminLeadScoreBadge :lead="l" @updated="(u) => Object.assign(l, u)" /></td>
                <td class="px-4 py-3 text-right tabular-nums">{{ dt.money(l.budget, { compact: true }) }}</td>
                <td class="px-4 py-3 text-stone-600">
                  <AdminInlineEdit
                    type="select"
                    label="Comercial"
                    :value="l.agentId ? String(l.agentId) : ''"
                    :display="l.agentName || (l.agentId ? `Comercial #${l.agentId}` : 'Sin asignar')"
                    :options="[{ value: '', label: 'Sin asignar' }, ...agents.map((a) => ({ value: String(a.id), label: a.name }))]"
                    :editable="canEdit"
                    :test-id="`lead-inline-agent-${l.id}`"
                    :save="(v) => reassignLeadOrThrow(l, String(v ?? ''))"
                  />
                </td>
                <td class="px-4 py-3 text-stone-500">{{ dt.relative(l.lastContactAt) }}</td>
                <td class="px-4 py-3 text-xs" :class="isNextActionOverdue(l) ? 'font-medium text-red-600' : 'text-stone-500'">
                  <template v-if="l.nextActionAt">{{ nextActionLabel(l.nextActionType) }} · {{ dt.relative(l.nextActionAt) }}</template>
                  <span v-else class="text-stone-300">—</span>
                </td>
                <td class="px-2 py-3"><AdminCommsContactActions v-if="l.phone" :lead-id="l.id" :phone="l.phone" :name="l.name" compact /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </AdminPanel>
      <!-- Paginación (FASE 28, bloque N7b): antes la Tabla se cortaba en 200 filas. -->
      <div class="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm" data-testid="leads-pagination">
        <span class="text-[12px] text-stone-500">{{ filteredTotal }} lead{{ filteredTotal === 1 ? '' : 's' }} con este filtro</span>
        <div v-if="tablePages > 1" class="flex items-center gap-3">
          <button type="button" class="btn-secondary !py-1.5" :disabled="page <= 1" data-testid="leads-page-prev" @click="page--">← Anterior</button>
          <span>{{ page }} / {{ tablePages }}</span>
          <button type="button" class="btn-secondary !py-1.5" :disabled="page >= tablePages" data-testid="leads-page-next" @click="page++">Siguiente →</button>
        </div>
      </div>
    </template>

    <LeadFormModal v-if="creating" @close="creating = false" @saved="onCreated" />
    <LeadLostModal v-if="losingLead" :name="losingLead.name" @close="cancelLost" @confirm="confirmLost" />
    <LeadLostModal v-if="tableLosing" :name="tableLosing.lead.name" @close="settleTableLost(null)" @confirm="settleTableLost" />
    <!-- Motivo de cada movimiento (cierre del núcleo, FASE 13): Kanban, Tabla y acción masiva. -->
    <LeadStageReasonModal
      v-if="reasonAsk"
      :title="reasonAsk.title"
      :sub="reasonAsk.sub"
      :to-stage="reasonAsk.toStage"
      :confirm-label="reasonAsk.confirmLabel"
      :warning="reasonAsk.warning"
      @close="settleReason(null)"
      @confirm="settleReason"
    />

    <!-- Nueva tarea -->
    <div v-if="newTaskLead" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="newTaskLead = null">
      <div class="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h3 class="mb-1 text-sm font-semibold">Nueva tarea</h3>
        <p class="mb-4 text-xs text-stone-500">{{ newTaskLead.name }}</p>
        <div class="space-y-3">
          <select v-model="taskForm.type" class="input">
            <option value="call">Llamada</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
            <option value="follow_up">Seguimiento</option>
            <option value="viewing">Visita</option>
            <option value="other">Otro</option>
          </select>
          <input v-model="taskForm.title" type="text" placeholder="Título" class="input" >
          <select v-model="taskForm.assigneeId" class="input">
            <option value="">Sin asignar</option>
            <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
          <input v-model="taskForm.dueAt" type="datetime-local" class="input" >
        </div>
        <p v-if="taskError" class="mt-3 text-sm font-medium text-red-600">{{ taskError }}</p>
        <div class="mt-4 flex justify-end gap-2">
          <button class="btn-secondary" @click="newTaskLead = null">Cancelar</button>
          <button class="btn-primary" :disabled="!taskForm.title.trim() || savingTask" @click="submitNewTask">{{ savingTask ? 'Guardando…' : 'Crear tarea' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { LEAD_LOST_REASON_LABELS, LEAD_PRIORITIES, LEAD_PRIORITY_LABELS, LEAD_SOURCES, LEAD_SOURCE_LABELS, leadSourceLabel } from '~/utils/leadCatalog'
import { nextActionLabel } from '~/utils/pipelineCatalog'
import { loadRelationOptions, type RelationOption } from '~/composables/useRelationOptions'
import LeadFormModal from '~/components/admin/leads/LeadFormModal.vue'
import LeadLostModal from '~/components/admin/leads/LeadLostModal.vue'
import LeadStageReasonModal from '~/components/admin/leads/LeadStageReasonModal.vue'
import TagChips from '~/components/admin/tags/TagChips.vue'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Leads — M&M Real Estate' })
const dt = useDash()
const toast = useToast()
const { confirm } = useConfirm()

const { canWrite } = useAdminPermissions()
const canEdit = computed(() => canWrite('crm'))

const view = ref<'board' | 'table'>('board')
const search = ref('')
const source = ref('all')
const officeId = ref('')
const priority = ref('')
const offices = ref<RelationOption[]>([])
onMounted(() => loadRelationOptions('offices').then((r) => (offices.value = r)))

// Alta manual (FASE 12): al crear, se abre su ficha.
const creating = ref(false)
async function onCreated(id: number) {
  creating.value = false
  await navigateTo(`/admin/leads/${id}`)
}

const scoreMin = ref('')
const sort = ref('')

// FASE 33 — el detalle de un KPI del dashboard comercial llega aquí con su
// scope en la URL; se respeta tal cual y se puede quitar. `ids` lo usa INMO
// (FASE 30) para abrir el lead concreto del que se está hablando.
const route = useRoute()
const router = useRouter()
// `officeScope` (núcleo N8a): oficina como entidad con la regla del dashboard (la del lead o, sin ella, la de su comercial).
const DRILL_KEYS = ['ids', 'createdFrom', 'createdTo', 'qualifiedFrom', 'qualifiedTo', 'agentId', 'office', 'officeScope', 'portal', 'campaign', 'propertyId', 'propertyKind', 'unattended'] as const
const drill = computed<Record<string, string>>(() => {
  const out: Record<string, string> = {}
  for (const k of DRILL_KEYS) if (typeof route.query[k] === 'string' && route.query[k]) out[k] = route.query[k] as string
  return out
})
if (typeof route.query.source === 'string' && route.query.source) source.value = route.query.source
if (route.query.view === 'table') view.value = 'table'
function clearDrill() {
  const q = Object.fromEntries(Object.entries(route.query).filter(([k]) => !(DRILL_KEYS as readonly string[]).includes(k)))
  router.replace({ query: q })
}

// Etiquetas (FASE 0): el filtro y su catálogo (las de la agencia).
const tag = ref(typeof route.query.tags === 'string' ? route.query.tags : '')
const tagOptions = ref<{ id: number; name: string }[]>([])
onMounted(async () => {
  try {
    tagOptions.value = (await $fetch<{ rows: { id: number; name: string }[] }>('/api/admin/crm-tags')).rows
  } catch {
    tagOptions.value = []
  }
})

/**
 * Paginación (FASE 28, bloque N7b): la Tabla pide páginas de 100 con el total
 * real; el Pipeline sigue cargando los 200 más recientes del filtro (un
 * tablero no se pagina) y avisa si hay más.
 */
const TABLE_PER_PAGE = 100
const page = ref(1)
/** El filtro actual tal cual lo entiende el servidor — el mismo para listar, exportar y «todos los filtrados». */
const currentFilters = computed<Record<string, string>>(() => {
  const out: Record<string, string> = {}
  const add = (k: string, v: string) => {
    if (v && v !== 'all') out[k] = v
  }
  add('search', search.value)
  add('source', source.value)
  add('officeId', officeId.value)
  add('priority', priority.value)
  add('scoreMin', scoreMin.value)
  add('sort', sort.value)
  add('tags', tag.value)
  return { ...out, ...drill.value }
})
const { data, refresh } = await useFetch<any>('/api/admin/saas/leads', {
  query: computed(() => ({ ...currentFilters.value, ...(view.value === 'table' ? { page: page.value, perPage: TABLE_PER_PAGE } : { page: 1, perPage: 200 }) })),
})
const rows = computed<any[]>(() => data.value?.rows || [])
const filteredTotal = computed<number>(() => Number(data.value?.total) || 0)
const tablePages = computed(() => Math.max(1, Math.ceil(filteredTotal.value / TABLE_PER_PAGE)))
watch([search, source, officeId, priority, scoreMin, sort, tag, drill, view], () => (page.value = 1))
const exportAllHref = computed(() => `/api/admin/saas/leads?${new URLSearchParams({ ...currentFilters.value, format: 'csv' }).toString()}`)
const counts = ref<Record<string, number>>({})
watch(data, (d) => { if (d?.counts) counts.value = { ...d.counts } }, { immediate: true })
/** Leads del filtro (lo que exporta «Exportar CSV»); el subtítulo de arriba usa los contadores del pipeline. */
const total = computed(() => filteredTotal.value)
const pipelineTotal = computed(() => Object.values(counts.value).reduce((a, b) => a + b, 0))

const { data: agentsData } = await useFetch<any>('/api/admin/saas/agents')
const agents = computed<any[]>(() => agentsData.value?.rows || [])

const reassigningId = ref<number | null>(null)
/**
 * Comercial desde la fila de la Tabla (edición inline, cierre C1): la misma
 * reasignación que el desplegable de las tarjetas (`/reassign`, con su
 * historial de asignaciones y LEAD_REASSIGNED), pero si falla lanza el
 * error para que el editor lo enseñe bajo el control.
 */
async function reassignLeadOrThrow(lead: any, agentIdValue: string) {
  const commercialId = agentIdValue ? Number(agentIdValue) : null
  if (commercialId === (lead.agentId || null)) return
  const updated = await $fetch<any>(`/api/admin/saas/leads/${lead.id}/reassign`, { method: 'POST', body: { commercialId } })
  lead.agentId = updated.agentId
  lead.agentName = updated.agentName
  toast.success('Lead reasignado')
}
async function reassignLead(lead: any, agentIdValue: string) {
  const commercialId = agentIdValue ? Number(agentIdValue) : null
  if (commercialId === (lead.agentId || null)) return
  reassigningId.value = lead.id
  const previousAgentId = lead.agentId
  const previousAgentName = lead.agentName
  try {
    const updated = await $fetch<any>(`/api/admin/saas/leads/${lead.id}/reassign`, { method: 'POST', body: { commercialId } })
    lead.agentId = updated.agentId
    lead.agentName = updated.agentName
    toast.success('Lead reasignado')
  } catch (e: any) {
    lead.agentId = previousAgentId
    lead.agentName = previousAgentName
    toast.error(e?.data?.statusMessage || 'No se pudo reasignar el lead')
  } finally {
    reassigningId.value = null
  }
}

/**
 * El motivo de un movimiento (cierre del núcleo, FASE 13): toda acción del
 * panel que mueve un lead —soltar una tarjeta, la fase de la Tabla, la
 * acción masiva— lo pide con LeadStageReasonModal antes de llamar al
 * servidor, que también lo exige. `null` = se canceló: no se mueve nada.
 */
interface ReasonAsk { title: string; sub: string; toStage: string; confirmLabel: string; warning?: string | null; resolve: (v: string | null) => void }
const reasonAsk = ref<ReasonAsk | null>(null)
function askReason(opts: Omit<ReasonAsk, 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => (reasonAsk.value = { ...opts, resolve }))
}
function settleReason(v: string | null) {
  const pending = reasonAsk.value
  reasonAsk.value = null
  pending?.resolve(v)
}
/** La ventana del motivo para llevar `lead` a `toStage` (si está perdido, reactivarlo primero). */
function askMoveReason(lead: any, toStage: string): Promise<string | null> {
  const wasLost = lead.status === 'lost'
  const reactivateOnly = wasLost && (toStage === lead.stage || !toStage)
  return askReason({
    title: wasLost ? 'Reactivar el lead' : 'Cambiar de fase',
    sub: wasLost
      ? reactivateOnly
        ? `${lead.name} vuelve a «${stageLabel(lead.stage)}».`
        : `${lead.name} se reactiva y pasa a «${stageLabel(toStage)}».`
      : `${lead.name}: ${stageLabel(lead.stage)} → ${stageLabel(toStage)}`,
    toStage: wasLost ? 'reactivated' : toStage,
    confirmLabel: wasLost ? 'Reactivar' : 'Cambiar fase',
  })
}

/**
 * Columnas del Kanban = stage (FASE 13), no status: `stage` es la posición
 * real en el pipeline y la que se mueve por drag&drop. "Perdidos" es la
 * excepción a propósito — es la dimensión de resultado (status), no un
 * stage, y arrastrar una tarjeta ahí fija el resultado sin perder en qué
 * stage se quedó (por eso no tiene su propio `l.stage`, se filtra por
 * `l.status === 'lost'` dentro de `byColumn`).
 */
const columns = [
  { key: 'new', label: 'Nuevos', dot: '#2563eb' },
  { key: 'contacted', label: 'Contactados', dot: '#7c3aed' },
  { key: 'qualifying', label: 'Cualificando', dot: '#a855f7' },
  { key: 'qualified', label: 'Cualificados', dot: '#d97706' },
  { key: 'viewing', label: 'Visita', dot: '#0ea5e9' },
  { key: 'offer', label: 'Oferta', dot: '#ea580c' },
  { key: 'negotiation', label: 'Negociación', dot: '#f59e0b' },
  { key: 'won', label: 'Ganados', dot: '#059669' },
  { key: 'lost', label: 'Perdidos', dot: '#a8a29e' },
]
function byColumn(key: string) {
  if (key === 'lost') return rows.value.filter((l) => l.status === 'lost')
  return rows.value.filter((l) => l.stage === key && l.status !== 'lost')
}
function stageLabel(stage: string) {
  return columns.find((c) => c.key === stage)?.label || stage
}
function lostReasonLabel(reason: string) {
  return LEAD_LOST_REASON_LABELS[reason] || reason
}

// --- Tareas (FASE 22) — próxima acción y creación rápida desde el tablero ---
function isNextActionOverdue(l: any) {
  return l.nextActionAt && l.nextActionAt < new Date().toISOString().replace('T', ' ').slice(0, 19)
}
const newTaskLead = ref<any>(null)
const taskForm = reactive({ type: 'call' as string, title: '', assigneeId: '' as string | number, dueAt: '' })
const taskError = ref('')
const savingTask = ref(false)
function openNewTask(l: any) {
  newTaskLead.value = l
  taskForm.type = 'call'
  taskForm.title = ''
  taskForm.assigneeId = l.agentId || ''
  taskForm.dueAt = ''
  taskError.value = ''
}
async function submitNewTask() {
  if (!taskForm.title.trim() || !newTaskLead.value) return
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
        leadId: newTaskLead.value.id,
      },
    })
    newTaskLead.value = null
    await refresh()
    toast.success('Tarea creada')
  } catch (e: any) {
    taskError.value = e?.data?.statusMessage || 'No se pudo crear la tarea'
  } finally {
    savingTask.value = false
  }
}

/**
 * Bulk Actions (FASE 28 incremento 3) — mismo framework de jobs que
 * Properties (server/utils/bulkActions/service.ts) y el mismo criterio de
 * confirmación+progreso+fallo parcial (docs/bulk-actions.md). Selección
 * manual, de la página o de todos los filtrados (bloque N7b: la Tabla pagina).
 */
const selectedIds = ref<number[]>([])
/** «Todos los filtrados»: la selección la resuelve el servidor con el mismo filtro (como en Propiedades). */
const selectAllFilteredMode = ref(false)
const selectionCount = computed(() => (selectAllFilteredMode.value ? filteredTotal.value : selectedIds.value.length))
function isSelected(id: number) {
  return selectedIds.value.includes(id)
}
function toggleSelect(id: number) {
  selectAllFilteredMode.value = false
  selectedIds.value = isSelected(id) ? selectedIds.value.filter((i) => i !== id) : [...selectedIds.value, id]
}
function selectAllFiltered() {
  selectAllFilteredMode.value = true
  selectedIds.value = rows.value.map((l) => l.id)
}
const allVisibleSelected = computed(() => !!rows.value.length && rows.value.every((l) => isSelected(l.id)))
function toggleSelectAllVisible() {
  selectAllFilteredMode.value = false
  if (allVisibleSelected.value) {
    const visible = new Set(rows.value.map((l) => l.id))
    selectedIds.value = selectedIds.value.filter((id) => !visible.has(id))
  } else {
    selectedIds.value = [...new Set([...selectedIds.value, ...rows.value.map((l) => l.id)])]
  }
}
function clearSelection() {
  selectedIds.value = []
  selectAllFilteredMode.value = false
}
// Cambiar de filtro invalida la selección — mismo criterio que PropertyList.vue.
watch([search, source, officeId, priority, scoreMin, tag, drill], () => clearSelection())

const pipelineColumns = columns.filter((c) => c.key !== 'lost')

type BulkAction = '' | 'change_commercial' | 'change_stage' | 'add_tag' | 'create_task' | 'recalculate_score'
const bulkAction = ref<BulkAction>('')
const bulkCommercialId = ref<number | ''>('')
const bulkStage = ref('')
const bulkTagName = ref('')
const bulkTaskType = ref('call')
const bulkTaskTitle = ref('')
const bulkTaskAssigneeId = ref<number | ''>('')
const bulkRunning = ref(false)
const bulkProgressLabel = ref('Aplicando…')

function onBulkActionChange() {
  bulkCommercialId.value = ''
  bulkStage.value = ''
  bulkTagName.value = ''
  bulkTaskType.value = 'call'
  bulkTaskTitle.value = ''
  bulkTaskAssigneeId.value = ''
}

const canRunBulkAction = computed(() => {
  if (!bulkAction.value) return false
  if (bulkAction.value === 'change_stage') return !!bulkStage.value
  if (bulkAction.value === 'add_tag') return !!bulkTagName.value.trim()
  if (bulkAction.value === 'create_task') return !!bulkTaskTitle.value.trim()
  return true // change_commercial: "Sin asignar" es válido
})

const BULK_ACTION_LABELS: Record<string, string> = {
  change_commercial: 'cambiar el comercial',
  change_stage: 'cambiar la fase',
  add_tag: 'añadir la etiqueta',
  create_task: 'crear una tarea para',
  recalculate_score: 'recalcular la puntuación de',
}

/** Mismo endpoint que "Exportar CSV" en Properties, con un filtro por ids — server/api/admin/saas/leads.get.ts. */
function exportSelection() {
  // «Todos los filtrados» exporta el filtro entero (sin tope); si no, los ids elegidos.
  const params = new URLSearchParams(selectAllFilteredMode.value ? { ...currentFilters.value, format: 'csv' } : { format: 'csv', ids: selectedIds.value.join(',') })
  window.open(`/api/admin/saas/leads?${params.toString()}`, '_blank')
}

async function runBulkAction() {
  if (!bulkAction.value || !canRunBulkAction.value || !selectionCount.value) return

  const affected = `${selectionCount.value} lead${selectionCount.value === 1 ? '' : 's'}`
  // «Cambiar fase» pide el motivo (va al historial de cada lead): su ventana
  // hace también de confirmación. El resto, la confirmación de siempre.
  let stageReason: string | null = null
  if (bulkAction.value === 'change_stage') {
    stageReason = await askReason({
      title: 'Cambiar de fase en bloque',
      sub: `${affected} → ${stageLabel(bulkStage.value)}`,
      toStage: bulkStage.value,
      confirmLabel: 'Aplicar',
      warning: `Se va a cambiar la fase de ${affected}. No se puede deshacer; el motivo queda en el historial de cada uno.`,
    })
    if (!stageReason) return
  } else {
    const ok = await confirm(`Se va a ${BULK_ACTION_LABELS[bulkAction.value]} ${affected}. No se puede deshacer.`, { title: '¿Aplicar acción masiva?', confirmLabel: 'Aplicar' })
    if (!ok) return
  }

  const params: Record<string, unknown> =
    bulkAction.value === 'change_commercial'
      ? { commercialId: bulkCommercialId.value || null }
      : bulkAction.value === 'change_stage'
        ? { stage: bulkStage.value, reason: stageReason }
        : bulkAction.value === 'add_tag'
          ? { tagName: bulkTagName.value.trim() }
          : bulkAction.value === 'recalculate_score'
            ? {}
            : { type: bulkTaskType.value, title: bulkTaskTitle.value.trim(), assigneeId: bulkTaskAssigneeId.value || null }

  bulkRunning.value = true
  bulkProgressLabel.value = 'Iniciando…'
  try {
    const created = await $fetch<{ job: { id: number; totalCount: number } }>('/api/admin/lead-bulk-jobs', {
      method: 'POST',
      body: selectAllFilteredMode.value
        ? { action: bulkAction.value, params, selectAllFiltered: true, filters: currentFilters.value }
        : { action: bulkAction.value, params, ids: selectedIds.value },
    })
    let job = created.job as any
    while (true) {
      bulkProgressLabel.value = `${job.completedCount + job.failedCount}/${job.totalCount}…`
      const result = await $fetch<{ done: boolean; job?: any }>(`/api/admin/lead-bulk-jobs/${created.job.id}`, { method: 'PUT', body: {} })
      if (result.job) job = result.job
      if (result.done) break
    }
    if (job.status === 'completed') toast.success(`Acción aplicada a ${job.completedCount} lead${job.completedCount === 1 ? '' : 's'}`)
    else if (job.status === 'partial') toast.error(`${job.completedCount} aplicado${job.completedCount === 1 ? '' : 's'}, ${job.failedCount} fallaron`)
    else toast.error('La acción falló en todos los leads seleccionados')
    clearSelection()
    bulkAction.value = ''
    await refresh()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo ejecutar la acción masiva')
  } finally {
    bulkRunning.value = false
  }
}

/**
 * Fase desde la fila de la Tabla (edición inline, cierre C1). Mismo servicio
 * que el Kanban (`PATCH /api/admin/saas/leads/:id` → transitionLeadStage /
 * setLeadOutcome), así que cada cambio deja su fila en el historial de fases
 * con quién y cuándo. «Perdido» pide el motivo con el mismo modal que el
 * Kanban; un lead perdido que se lleva a una fase se reactiva primero
 * (queda «reactivado» en el historial) y después se mueve a la fase elegida.
 */
const tableStageOptions = [...pipelineColumns.map((c) => ({ value: c.key, label: c.label })), { value: 'lost', label: 'Perdido (pide motivo)' }]
function tableStageValue(l: any) {
  return l.status === 'lost' ? 'lost' : l.stage
}
const tableLosing = ref<{ lead: any; resolve: (v: { lostReason: string; note: string | null } | null) => void } | null>(null)
function settleTableLost(v: { lostReason: string; note: string | null } | null) {
  const pending = tableLosing.value
  tableLosing.value = null
  pending?.resolve(v)
}
async function saveTableStage(lead: any, toStage: string) {
  const wasLost = lead.status === 'lost'
  if (toStage === 'lost') {
    const lost = await new Promise<{ lostReason: string; note: string | null } | null>((resolve) => (tableLosing.value = { lead, resolve }))
    // Cancelar el motivo no cambia nada: el editor vuelve a enseñar la fase de antes.
    if (!lost) return
    const res = await $fetch<any>(`/api/admin/saas/leads/${lead.id}`, { method: 'PATCH', body: { lost: true, lostReason: lost.lostReason, note: lost.note } })
    Object.assign(lead, { status: res.status, stage: res.stage, lostReason: res.lostReason })
  } else {
    if (!wasLost && lead.stage === toStage) return
    // El motivo (obligatorio): cancelar la ventana no cambia nada.
    const reason = await askMoveReason(lead, toStage)
    if (!reason) return
    if (wasLost) {
      const res = await $fetch<any>(`/api/admin/saas/leads/${lead.id}`, { method: 'PATCH', body: { lost: false, note: reason } })
      Object.assign(lead, { status: res.status, stage: res.stage, lostReason: null })
    }
    if (lead.stage !== toStage) {
      const res = await $fetch<any>(`/api/admin/saas/leads/${lead.id}`, { method: 'PATCH', body: { stage: toStage, reason } })
      Object.assign(lead, { status: res.status, stage: res.stage })
    }
  }
  toast.success(toStage === 'lost' ? 'Lead marcado como perdido' : `Fase: ${stageLabel(toStage)}`)
  // Los contadores del Pipeline salen del servidor.
  refresh()
}

const dragId = ref<number | null>(null)
// Soltar en «Perdidos» abre el modal del motivo (catálogo + comentario): el
// movimiento sólo se aplica al confirmarlo.
const losingLead = ref<any>(null)
function cancelLost() {
  losingLead.value = null
}
async function confirmLost(v: { lostReason: string; note: string | null }) {
  const lead = losingLead.value
  losingLead.value = null
  if (lead) await applyDrop(lead, 'lost', v)
}
async function onDrop(columnKey: string) {
  const id = dragId.value
  dragId.value = null
  if (!id) return
  const lead = rows.value.find((l) => l.id === id)
  if (!lead) return
  const fromColumn = lead.status === 'lost' ? 'lost' : lead.stage
  if (fromColumn === columnKey) return
  if (columnKey === 'lost') {
    losingLead.value = lead
    return
  }
  // Cualquier otra columna pide el motivo; cancelar deja la tarjeta donde estaba.
  // Sacar una de «Perdidos» la reactiva en la fase en la que se quedó.
  const reason = await askMoveReason(lead, lead.status === 'lost' ? lead.stage : columnKey)
  if (!reason) return
  await applyDrop(lead, columnKey, undefined, reason)
}
async function applyDrop(lead: any, columnKey: string, lost?: { lostReason: string; note: string | null }, reason?: string) {
  const id = lead.id
  const wasLost = lead.status === 'lost'
  const fromColumn = wasLost ? 'lost' : lead.stage

  // optimistic
  counts.value[fromColumn] = Math.max(0, (counts.value[fromColumn] || 1) - 1)
  counts.value[columnKey] = (counts.value[columnKey] || 0) + 1
  const previousStage = lead.stage
  const previousStatus = lead.status
  const previousLostReason = lead.lostReason

  try {
    if (columnKey === 'lost' && lost) {
      // Perder pide motivo: un lead perdido sin explicación no dice nada al
      // repasar el pipeline la semana siguiente. Queda en su historial.
      lead.status = 'lost'
      lead.lostReason = lost.lostReason
      const res = await $fetch<any>(`/api/admin/saas/leads/${id}`, { method: 'PATCH', body: { lost: true, lostReason: lost.lostReason, note: lost.note } })
      lead.status = res.status
      lead.stage = res.stage
      lead.lostReason = res.lostReason
    } else if (wasLost) {
      // Reactivar desde "Perdidos": vuelve al stage en el que se quedó.
      lead.status = 'active'
      const res = await $fetch<any>(`/api/admin/saas/leads/${id}`, { method: 'PATCH', body: { lost: false, note: reason } })
      lead.status = res.status
      lead.stage = res.stage
      lead.lostReason = null
    } else {
      lead.stage = columnKey
      const res = await $fetch<any>(`/api/admin/saas/leads/${id}`, { method: 'PATCH', body: { stage: columnKey, reason } })
      lead.status = res.status
      lead.stage = res.stage
    }
  } catch {
    lead.stage = previousStage
    lead.status = previousStatus
    lead.lostReason = previousLostReason
    counts.value[columnKey] = Math.max(0, (counts.value[columnKey] || 1) - 1)
    counts.value[fromColumn] = (counts.value[fromColumn] || 0) + 1
    toast.error('No se pudo actualizar el lead')
    refresh()
  }
}
</script>
