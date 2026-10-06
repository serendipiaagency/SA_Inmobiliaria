<template>
  <div>
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">{{ trashed ? 'Papelera · Operaciones' : 'Operaciones' }}</h1>
        <p class="mt-1 text-sm text-stone-500">
          <template v-if="trashed">{{ rows.length }} operación{{ rows.length === 1 ? '' : 'es' }} en la papelera</template>
          <template v-else>
            {{ rows.length }} operación{{ rows.length === 1 ? '' : 'es' }} · de la oferta aceptada a la firma{{ view === 'board' && canEdit ? ' · arrastra una tarjeta para cambiar de etapa' : '' }}
          </template>
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <NuxtLink to="/admin/operaciones" class="text-[12px] text-stone-500 hover:underline" data-testid="deals-legacy-link">Cierres y comisiones →</NuxtLink>
        <button type="button" class="btn-quiet !px-3 !py-1.5" data-testid="deals-trash-toggle" @click="trashed = !trashed">{{ trashed ? '← Volver a las operaciones' : 'Papelera' }}</button>
        <div v-if="!trashed" class="flex gap-1 rounded-lg bg-stone-100 p-0.5">
          <button type="button" class="rounded-md px-3 py-1.5 text-xs font-medium transition" :class="view === 'board' ? 'bg-white text-ink shadow-sm' : 'text-stone-500'" data-testid="deals-view-board" @click="view = 'board'">Kanban</button>
          <button type="button" class="rounded-md px-3 py-1.5 text-xs font-medium transition" :class="view === 'table' ? 'bg-white text-ink shadow-sm' : 'text-stone-500'" data-testid="deals-view-table" @click="view = 'table'">Lista</button>
        </div>
      </div>
    </div>

    <p v-if="trashed" class="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800" data-testid="deals-trash-notice">
      Las operaciones de la papelera no salen en el Kanban ni en la lista y su ficha no se abre. Su historial de etapas, tareas, citas y actividad se
      conservan; «Restaurar» la devuelve tal cual estaba. Una operación cerrada, o con reserva, arras o contrato vinculados, no se puede mandar aquí.
    </p>

    <!-- Filtros -->
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <select v-if="!trashed" v-model="status" class="rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink" data-testid="deals-status">
        <option value="active">Activas</option>
        <option value="closed">Cerradas</option>
        <option value="cancelled">Canceladas</option>
        <option value="">Todas</option>
      </select>
      <select v-model="officeId" class="rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink" data-testid="deals-office">
        <option value="">Todas las oficinas</option>
        <option v-for="o in offices" :key="o.id" :value="String(o.id)">{{ o.label }}</option>
      </select>
      <select v-model="commercialId" class="rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink" data-testid="deals-commercial">
        <option value="">Todos los comerciales</option>
        <option v-for="a in agents" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
      </select>
      <select v-model="propertyKind" class="rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink">
        <option value="">Los dos catálogos</option>
        <option value="developer">Obra nueva</option>
        <option value="agent">2ª mano</option>
      </select>
    </div>

    <!-- Papelera (cierre C1): una lista apilada, sin enlace a la ficha (es 404 mientras esté aquí), con «Restaurar». -->
    <AdminPanel v-if="trashed" :pad="false">
      <div v-if="!rows.length" class="py-16 text-center text-sm text-stone-400" data-testid="deals-trash-empty">La papelera está vacía.</div>
      <ul v-else class="divide-y divide-line" data-testid="deals-trash-list">
        <li v-for="d in rows" :key="d.id" class="flex flex-wrap items-center gap-3 px-4 py-3" :data-testid="`deal-trash-row-${d.id}`">
          <div class="min-w-0 flex-1 basis-56">
            <p class="truncate text-sm font-medium text-ink">#{{ d.id }} · {{ d.buyerName || `Comprador #${d.buyerContactId}` }}</p>
            <p class="truncate text-[11px] text-stone-400">
              {{ d.propertyName || `Inmueble #${d.propertyId}` }} · {{ DEAL_STAGE_LABELS[d.stage] || d.stage }} · {{ DEAL_STATUS_LABELS[d.status] || d.status }} ·
              {{ formatAmount(d.agreedAmount, d.currency) }}<template v-if="d.deletedAt"> · Borrada el {{ formatDate(d.deletedAt) }}</template>
            </p>
          </div>
          <button v-if="canEdit" type="button" class="shrink-0 text-xs font-medium text-emerald-700 hover:underline" :data-testid="`deal-restore-${d.id}`" @click="restoreDeal(d)">Restaurar</button>
        </li>
      </ul>
    </AdminPanel>

    <!-- Kanban por las 8 etapas -->
    <div v-else-if="view === 'board'" class="flex gap-3 overflow-x-auto pb-2" data-testid="deals-board">
      <div
        v-for="stage in DEAL_STAGES"
        :key="stage"
        class="flex w-64 shrink-0 flex-col rounded-xl border border-line bg-[#f7f6f4]"
        :class="dropTarget === stage ? 'ring-2 ring-ink/30' : ''"
        :data-testid="`deals-column-${stage}`"
        @dragover.prevent="dropTarget = stage"
        @dragleave="dropTarget = null"
        @drop="onDrop(stage)"
      >
        <div class="flex items-center justify-between border-b border-line px-3.5 py-2.5">
          <span class="text-sm font-semibold">{{ DEAL_STAGE_LABELS[stage] }}</span>
          <span class="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-stone-500">{{ byStage(stage).length }}</span>
        </div>
        <div class="flex-1 space-y-2 overflow-y-auto p-2.5" style="max-height: 64vh">
          <article
            v-for="d in byStage(stage)"
            :key="d.id"
            :draggable="canDrag(d)"
            class="rounded-lg border border-line bg-white p-3 shadow-sm transition"
            :class="[canDrag(d) ? 'cursor-grab hover:shadow-md active:cursor-grabbing' : '', dragId === d.id ? 'opacity-40' : '', d.status === 'cancelled' ? 'opacity-60' : '']"
            :data-testid="`deal-card-${d.id}`"
            @dragstart="dragId = d.id"
            @dragend="dragId = null"
          >
            <NuxtLink :to="`/admin/deal-operations/${d.id}`" class="block truncate text-sm font-semibold hover:underline">{{ d.buyerName || `Comprador #${d.buyerContactId}` }}</NuxtLink>
            <p class="truncate text-xs text-stone-500">{{ d.propertyName || `Inmueble #${d.propertyId}` }}</p>
            <p class="mt-1 text-xs font-medium tabular-nums">{{ formatAmount(d.agreedAmount, d.currency) }}</p>
            <p class="mt-1 text-[11px] text-stone-400">
              {{ d.commercialName || 'Sin comercial' }}<template v-if="d.officeName"> · {{ d.officeName }}</template><template v-if="d.linkedRecords"> · {{ d.linkedRecords }} doc.</template>
            </p>
            <p v-if="d.status !== 'active'" class="mt-1 text-[11px] font-medium" :class="d.status === 'cancelled' ? 'text-red-600' : 'text-emerald-700'">{{ DEAL_STATUS_LABELS[d.status] }}</p>
            <select
              v-if="canDrag(d)"
              class="mt-2 w-full rounded border border-line bg-white px-1.5 py-1 text-[11px] text-stone-600"
              :value="d.stage"
              :aria-label="`Mover la operación #${d.id} a otra etapa`"
              :data-testid="`deal-move-${d.id}`"
              @change="onSelectMove(d, $event)"
            >
              <option v-for="s in DEAL_STAGES" :key="s" :value="s">{{ s === d.stage ? `En ${DEAL_STAGE_LABELS[s]}` : `Mover a ${DEAL_STAGE_LABELS[s]}` }}</option>
            </select>
          </article>
          <p v-if="!byStage(stage).length" class="py-6 text-center text-xs text-stone-400">Vacío</p>
        </div>
      </div>
    </div>

    <!-- Lista -->
    <AdminPanel v-else :pad="false">
      <div v-if="!rows.length" class="py-16 text-center text-sm text-stone-400">Sin operaciones con estos filtros.</div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm" data-testid="deals-table">
          <thead class="border-b border-line bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-400">
            <tr>
              <th class="px-4 py-2.5 font-semibold">Operación</th>
              <th class="px-4 py-2.5 font-semibold">Inmueble</th>
              <th class="px-4 py-2.5 font-semibold">Etapa</th>
              <th class="px-4 py-2.5 font-semibold">Estado</th>
              <th class="px-4 py-2.5 text-right font-semibold">Importe</th>
              <th class="px-4 py-2.5 font-semibold">Comercial</th>
              <th class="px-4 py-2.5 font-semibold">Oficina</th>
              <th class="px-4 py-2.5 font-semibold">Abierta</th>
              <th v-if="canEdit" class="px-2 py-2.5 font-semibold"><span class="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in rows" :key="d.id" class="border-b border-line/60 last:border-0 hover:bg-stone-50">
              <td class="px-4 py-3">
                <NuxtLink :to="`/admin/deal-operations/${d.id}`" class="font-medium hover:underline">#{{ d.id }} · {{ d.buyerName || `Comprador #${d.buyerContactId}` }}</NuxtLink>
              </td>
              <td class="px-4 py-3 text-stone-600">{{ d.propertyName || `#${d.propertyId}` }}</td>
              <td class="px-4 py-3">{{ DEAL_STAGE_LABELS[d.stage] || d.stage }}</td>
              <td class="px-4 py-3 text-stone-600">{{ DEAL_STATUS_LABELS[d.status] || d.status }}</td>
              <td class="px-4 py-3 text-right tabular-nums">{{ formatAmount(d.agreedAmount, d.currency) }}</td>
              <td class="px-4 py-3 text-stone-600">{{ d.commercialName || '—' }}</td>
              <td class="px-4 py-3 text-stone-600">{{ d.officeName || '—' }}</td>
              <td class="px-4 py-3 text-stone-500">{{ formatDate(d.openedAt) }}</td>
              <td v-if="canEdit" class="px-2 py-3 text-right">
                <!-- Una cerrada no va a la papelera (ver trashDeal()): ni se ofrece. -->
                <button v-if="d.status !== 'closed'" type="button" class="btn-quiet !px-2 !py-1 text-[11px] text-red-600" :data-testid="`deal-trash-${d.id}`" @click="trashDeal(d)">Papelera</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AdminPanel>
  </div>
</template>

<script setup lang="ts">
import { formatDate } from '~/composables/useClientConfig'
import { loadRelationOptions, type RelationOption } from '~/composables/useRelationOptions'
import { DEAL_STAGES, DEAL_STAGE_LABELS, DEAL_STATUS_LABELS, formatAmount } from '~/utils/pipelineCatalog'

/**
 * Operaciones (FASE 24, bloque N6) — listado y Kanban por las 8 etapas del
 * pipeline de `deal_operations`: oferta aceptada → reserva → arras →
 * financiación → documentación → notaría → firma → cerrada. Mover una
 * tarjeta (arrastrándola o con «Mover a…») cambia la etapa en el servidor,
 * que deja la fila en el historial de etapas con quién y cuándo; soltarla
 * en «Cerrada» pide confirmación y cierra la operación de verdad (puente a
 * comisiones incluido).
 *
 * La pantalla antigua `/admin/operaciones` (tabla legacy `deals`, cierres
 * para comisiones) sigue en su URL, ahora en el menú como «Cierres y
 * comisiones» — ver docs/deals.md.
 *
 * Cierre C1: «Papelera» en cada fila de la Lista (y en la ficha) y la vista
 * Papelera con «Restaurar».
 */
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Operaciones — M&M Real Estate' })
const toast = useToast()
const { confirm } = useConfirm()
const { canWrite } = useAdminPermissions()
const canEdit = computed(() => canWrite('crm'))

const route = useRoute()
const router = useRouter()
const view = ref<'board' | 'table'>('board')
/** Papelera (cierre C1): en la URL (`?trashed=1`), así el aviso de una oferta cuya operación está aquí lleva directo a ella. */
const trashed = ref(route.query.trashed === '1')
watch(trashed, (v) => router.replace({ query: { ...route.query, trashed: v ? '1' : undefined } }))
const status = ref('active')
const officeId = ref('')
const commercialId = ref('')
const propertyKind = ref('')

const query = computed(() => {
  const q: Record<string, any> = {}
  if (trashed.value) q.trashed = '1'
  else if (status.value) q.status = status.value
  if (officeId.value) q.officeId = officeId.value
  if (commercialId.value) q.commercialId = commercialId.value
  if (propertyKind.value) q.propertyKind = propertyKind.value
  return q
})
const { data, refresh } = await useFetch<any>('/api/admin/saas/deal-operations', { query })
const rows = computed<any[]>(() => data.value?.rows || [])
function byStage(stage: string) {
  return rows.value.filter((d) => d.stage === stage)
}

const { data: agentsData } = await useFetch<any>('/api/admin/saas/agents')
const agents = computed<any[]>(() => agentsData.value?.rows || [])
const offices = ref<RelationOption[]>([])
onMounted(() => loadRelationOptions('offices').then((r) => (offices.value = r)))

const dragId = ref<number | null>(null)
const dropTarget = ref<string | null>(null)
function canDrag(d: any) {
  return canEdit.value && d.status === 'active'
}
function onDrop(stage: string) {
  dropTarget.value = null
  const d = rows.value.find((r) => r.id === dragId.value)
  dragId.value = null
  if (d) moveTo(d, stage)
}

/** El desplegable vuelve a enseñar la etapa actual: si el cambio sale bien, la tarjeta ya estará en su nueva columna. */
function onSelectMove(d: any, event: Event) {
  const select = event.target as HTMLSelectElement
  const stage = select.value
  select.value = d.stage
  moveTo(d, stage)
}

/**
 * Papelera (cierre C1): `POST { action: 'trash' }`. El servidor decide si se
 * puede (409 con el motivo si está cerrada o tiene reserva, arras o contrato
 * vinculados) y deja DEAL_TRASHED en la actividad.
 */
async function trashDeal(d: any) {
  const ok = await confirm(`La operación #${d.id} irá a la papelera: sale del Kanban y de la lista, y su ficha no se abre. No se borra nada (historial, tareas, citas y actividad) y se puede restaurar.`, {
    title: '¿Mandar la operación a la papelera?',
    confirmLabel: 'Mandar a la papelera',
    danger: true,
  })
  if (!ok) return
  try {
    await $fetch('/api/admin/saas/deal-operations', { method: 'POST', body: { id: d.id, action: 'trash' } })
    toast.success('Operación enviada a la papelera')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo mandar a la papelera')
  }
  refresh()
}

async function restoreDeal(d: any) {
  try {
    await $fetch('/api/admin/saas/deal-operations', { method: 'POST', body: { id: d.id, action: 'restore' } })
    toast.success('Operación restaurada')
    refresh()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo restaurar la operación')
  }
}

async function moveTo(d: any, stage: string) {
  if (!canDrag(d) || stage === d.stage) return
  try {
    if (stage === 'closed') {
      const ok = await confirm(`La operación #${d.id} quedará cerrada: deja de estar activa, se marca el inmueble como vendido cuando el catálogo lo permite y se crea su apunte en «Cierres y comisiones».`, { title: '¿Cerrar la operación?', confirmLabel: 'Cerrar operación' })
      if (!ok) return refresh()
      await $fetch('/api/admin/saas/deal-operations', { method: 'POST', body: { id: d.id, action: 'close' } })
      toast.success('Operación cerrada')
    } else {
      await $fetch('/api/admin/saas/deal-operations', { method: 'POST', body: { id: d.id, action: 'stage', toStage: stage } })
      toast.success(`Movida a ${DEAL_STAGE_LABELS[stage]}`)
    }
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo cambiar de etapa')
  }
  refresh()
}
</script>
