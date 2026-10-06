<template>
  <div>
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">{{ inTrash ? 'Papelera · Tareas' : 'Tareas' }}</h1>
        <p class="mt-1 text-sm text-stone-500">{{ rows.length }} tarea{{ rows.length === 1 ? '' : 's' }}{{ inTrash ? ' en la papelera' : '' }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class="btn-quiet" data-testid="tasks-trash-toggle" @click="toggleTrash">{{ inTrash ? '← Volver a las tareas' : 'Papelera' }}</button>
        <button v-if="canEdit && !inTrash" type="button" class="btn-primary" data-testid="task-new" @click="openNewTask">+ Nueva tarea</button>
      </div>
    </div>

    <p v-if="inTrash" class="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800" data-testid="tasks-trash-notice">
      Las tareas de la papelera no salen en los listados ni cuentan para la próxima acción de su lead. «Restaurar» la devuelve tal cual estaba (estado, fecha,
      responsable y relaciones) y queda anotado en su actividad.
    </p>

    <!-- Filtros -->
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <select v-model="bucket" class="rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink" data-testid="tasks-bucket">
        <option value="active">Pendientes (abiertas y en curso)</option>
        <option value="open">Abiertas</option>
        <option value="in_progress">En curso</option>
        <option value="overdue">Vencidas</option>
        <option value="today">Vencen hoy</option>
        <option value="completed">Completadas</option>
        <option value="cancelled">Canceladas</option>
        <option value="all">Todas</option>
        <option value="trash">Papelera</option>
      </select>
      <select v-model="assigneeId" class="rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink">
        <option value="">Todos los comerciales</option>
        <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
      </select>
      <!-- Cierre D3a: la oficina de la tarea o, si no tiene, la de su responsable (la misma regla que el dashboard). -->
      <select v-model="officeId" class="rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink" data-testid="tasks-filter-office" aria-label="Oficina">
        <option value="">Todas las oficinas</option>
        <option v-for="o in offices" :key="o.id" :value="o.id">{{ o.label }}</option>
      </select>
      <select v-model="type" class="rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink">
        <option value="">Todos los tipos</option>
        <option v-for="ty in TASK_TYPES" :key="ty" :value="ty">{{ TASK_TYPE_LABELS[ty] }}</option>
      </select>
      <select v-model="priority" class="rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink">
        <option value="">Toda prioridad</option>
        <option v-for="p in TASK_PRIORITIES" :key="p" :value="p">{{ TASK_PRIORITY_LABELS[p] }}</option>
      </select>
    </div>

    <AdminPanel :pad="false">
      <div v-if="!rows.length" class="py-16 text-center text-sm text-stone-400" :data-testid="inTrash ? 'tasks-trash-empty' : undefined">{{ inTrash ? 'La papelera está vacía.' : 'Sin tareas con estos filtros.' }}</div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b border-line bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-400">
            <tr>
              <th class="px-4 py-2.5 font-semibold">Tarea</th>
              <th class="px-4 py-2.5 font-semibold">Relacionada con</th>
              <th class="px-4 py-2.5 font-semibold">Comercial</th>
              <th class="px-4 py-2.5 font-semibold">Vence</th>
              <th class="px-4 py-2.5 font-semibold">Prioridad</th>
              <th class="px-4 py-2.5 font-semibold">Estado</th>
              <th v-if="inTrash" class="px-4 py-2.5 font-semibold">Borrada</th>
              <th class="px-2 py-2.5 font-semibold"><span class="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in rows" :key="t.id" class="border-b border-line/60 last:border-0 hover:bg-stone-50" :data-testid="`task-row-${t.id}`">
              <td class="px-4 py-3">
                <p class="font-medium">{{ t.title }}</p>
                <p class="text-xs text-stone-400">{{ TASK_TYPE_LABELS[t.type] || t.type }}</p>
                <CreatedBy class="block" :created-by-name="t.createdByName" :created-by-deleted="t.createdByDeleted" :created-at="t.createdAt" />
              </td>
              <td class="px-4 py-3 text-xs text-stone-500">
                <ul class="space-y-0.5">
                  <li v-if="t.contactId"><NuxtLink :to="`/admin/contactos/${t.contactId}`" class="hover:underline">Contacto: {{ t.contactName || `#${t.contactId}` }}</NuxtLink></li>
                  <li v-if="t.leadId"><NuxtLink :to="`/admin/leads/${t.leadId}`" class="hover:underline">Lead: {{ t.leadName || `#${t.leadId}` }}</NuxtLink></li>
                  <li v-if="t.propertyId">
                    <NuxtLink :to="`/admin/${t.propertyKind === 'agent' ? 'properties' : 'developer-properties'}/${t.propertyId}`" class="hover:underline">Inmueble: {{ t.propertyName || `#${t.propertyId}` }}</NuxtLink>
                  </li>
                  <li v-if="t.appointmentId"><NuxtLink to="/admin/visitas" class="hover:underline">Cita: {{ t.appointmentLabel || `#${t.appointmentId}` }}</NuxtLink></li>
                  <li v-if="t.dealId"><NuxtLink :to="`/admin/deal-operations/${t.dealId}`" class="hover:underline">Operación #{{ t.dealId }}</NuxtLink></li>
                  <li v-if="!t.contactId && !t.leadId && !t.propertyId && !t.appointmentId && !t.dealId" class="text-stone-300">—</li>
                </ul>
              </td>
              <td class="px-4 py-3 text-stone-600">
                {{ t.assigneeName || agentName(t.assigneeId) || 'Sin asignar' }}
                <p v-if="t.officeName" class="text-xs text-stone-400" :data-testid="`task-office-${t.id}`" :title="t.officeFromAssignee ? 'La oficina de su responsable' : 'Oficina de la tarea'">
                  {{ t.officeName }}<template v-if="t.officeFromAssignee"> · de su responsable</template>
                </p>
              </td>
              <td class="px-4 py-3 text-stone-500">
                <span v-if="t.dueAt" :class="isOverdue(t) ? 'font-medium text-red-600' : ''">{{ formatDateTime(t.dueAt) }}</span>
                <span v-else class="text-stone-300">—</span>
              </td>
              <td class="px-4 py-3"><span class="rounded px-1.5 py-0.5 text-xs font-semibold" :class="PRIORITY_CLS[t.priority]">{{ TASK_PRIORITY_LABELS[t.priority] || t.priority }}</span></td>
              <td class="px-4 py-3">
                <select
                  v-if="canEdit && !inTrash"
                  class="rounded-full border-0 px-2 py-0.5 text-[11px] font-semibold focus:ring-1 focus:ring-ink"
                  :class="STATUS_CLS[t.status]"
                  :value="t.status"
                  :aria-label="`Estado de ${t.title}`"
                  :data-testid="`task-status-${t.id}`"
                  @change="setStatus(t, ($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="st in TASK_STATUSES" :key="st" :value="st">{{ TASK_STATUS_LABELS[st] }}</option>
                </select>
                <span v-else class="rounded-full px-2 py-0.5 text-[10px] font-semibold" :class="STATUS_CLS[t.status]">{{ TASK_STATUS_LABELS[t.status] || t.status }}</span>
              </td>
              <td v-if="inTrash" class="px-4 py-3 text-xs text-stone-500">{{ t.deletedAt ? formatDateTime(t.deletedAt) : '—' }}</td>
              <td class="px-2 py-3">
                <!-- Papelera (cierre C1): la única acción que tiene sentido aquí es devolverla. -->
                <div v-if="canEdit && inTrash" class="flex justify-end">
                  <button type="button" class="btn-quiet !px-2 !py-1 text-[11px] text-emerald-700" :data-testid="`task-restore-${t.id}`" @click="restore(t)">Restaurar</button>
                </div>
                <div v-else-if="canEdit" class="flex justify-end gap-1">
                  <button v-if="t.status === 'open'" type="button" class="btn-quiet !px-2 !py-1 text-[11px]" @click="setStatus(t, 'in_progress')">Empezar</button>
                  <button v-if="t.status === 'open' || t.status === 'in_progress'" type="button" class="btn-quiet !px-2 !py-1 text-[11px]" @click="setStatus(t, 'completed')">Completar</button>
                  <button type="button" class="btn-quiet !px-2 !py-1 text-[11px]" :data-testid="`task-edit-${t.id}`" @click="editing = t">Editar</button>
                  <button type="button" class="btn-quiet !px-2 !py-1 text-[11px] text-red-600" :data-testid="`task-delete-${t.id}`" @click="remove(t)">Borrar</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AdminPanel>

    <TaskFormModal v-if="newTask" :agents="agents" @close="newTask = false" @saved="onSaved('Tarea creada')" />
    <TaskFormModal v-if="editing" :task="editing" :agents="agents" @close="editing = null" @saved="onSaved('Tarea actualizada')" />
  </div>
</template>

<script setup lang="ts">
import { formatDateTime } from '~/composables/useClientConfig'
import TaskFormModal from '~/components/admin/tasks/TaskFormModal.vue'
import CreatedBy from '~/components/admin/CreatedBy.vue'
import { loadRelationOptions, type RelationOption } from '~/composables/useRelationOptions'
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_STATUSES, TASK_STATUS_LABELS, TASK_TYPES, TASK_TYPE_LABELS } from '~/utils/pipelineCatalog'

/**
 * Tareas (FASE 22): trabajo pendiente de toda la organización, no sólo del
 * comercial que la mira — igual que Calendar, RBAC aquí es por área (`crm`),
 * nunca por fila, así que el filtro "Comercial" organiza la vista, no la
 * restringe (mismo criterio documentado en docs/calendar.md).
 *
 * Bloque N6: cada tarea se edita entera (tipo, título, responsable, fecha,
 * prioridad, estado —también «En curso»— y sus relaciones con contacto,
 * lead, propiedad, cita y operación), y «Borrar» la manda a la papelera
 * (`deletedAt`): sale de los listados y de la próxima acción del lead, pero
 * su actividad se conserva. Ver docs/tasks.md.
 *
 * Cierre C1: la vista «Papelera» (`bucket=trash`, también en la URL) lista
 * las borradas con su fecha y «Restaurar» (PATCH `{ deleted: false }`), que
 * la devuelve tal cual y deja TASK_RESTORED en su actividad.
 *
 * Cierre D3a: filtro y columna de oficina (la de la tarea o la de su
 * responsable) y quién creó cada tarea.
 */
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Tareas — M&M Real Estate' })
const toast = useToast()
const { confirm } = useConfirm()
const { canWrite } = useAdminPermissions()
const canEdit = computed(() => canWrite('crm'))
const route = useRoute()

const PRIORITY_CLS: Record<string, string> = { low: 'bg-stone-100 text-stone-500', medium: 'bg-blue-50 text-blue-700', high: 'bg-amber-50 text-amber-700', urgent: 'bg-red-50 text-red-700' }
const STATUS_CLS: Record<string, string> = { open: 'bg-blue-50 text-blue-700', in_progress: 'bg-amber-50 text-amber-700', completed: 'bg-emerald-50 text-emerald-700', cancelled: 'bg-stone-100 text-stone-500' }
function isOverdue(t: any) {
  return (t.status === 'open' || t.status === 'in_progress') && t.dueAt && t.dueAt < new Date().toISOString().replace('T', ' ').slice(0, 19)
}

type Bucket = 'active' | 'open' | 'in_progress' | 'overdue' | 'today' | 'completed' | 'cancelled' | 'all' | 'trash'
const BUCKETS: Bucket[] = ['active', 'open', 'in_progress', 'overdue', 'today', 'completed', 'cancelled', 'all', 'trash']
const bucket = ref<Bucket>(BUCKETS.includes(route.query.bucket as Bucket) ? (route.query.bucket as Bucket) : 'active')
const inTrash = computed(() => bucket.value === 'trash')
function toggleTrash() {
  bucket.value = inTrash.value ? 'active' : 'trash'
}
// La vista elegida vive en la URL (un enlace a la papelera abre la papelera).
const router = useRouter()
watch(bucket, (b) => router.replace({ query: { ...route.query, bucket: b === 'active' ? undefined : b } }))
// Comercial y oficina también llegan por la URL (el enlace «Tareas vencidas» del dashboard comercial).
const assigneeId = ref<string | number>(route.query.assigneeId ? Number(route.query.assigneeId) : '')
const officeId = ref<string | number>(route.query.officeId ? Number(route.query.officeId) : '')
const type = ref('')
const priority = ref('')
const offices = ref<RelationOption[]>([])
onMounted(() => loadRelationOptions('offices').then((r) => (offices.value = r)))

const query = computed(() => {
  const q: Record<string, any> = {}
  if (bucket.value === 'overdue') q.overdue = '1'
  else if (bucket.value === 'today') q.dueToday = '1'
  else if (bucket.value === 'trash') q.trashed = '1'
  else if (bucket.value !== 'all') q.status = bucket.value
  if (assigneeId.value) q.assigneeId = assigneeId.value
  if (officeId.value) q.officeId = officeId.value
  if (type.value) q.type = type.value
  if (priority.value) q.priority = priority.value
  return q
})
const { data, refresh } = await useFetch<any>('/api/admin/saas/tasks', { query })
const rows = computed<any[]>(() => data.value?.rows || [])

const { data: agentsData } = await useFetch<any>('/api/admin/saas/agents')
const agents = computed<any[]>(() => agentsData.value?.rows || [])
function agentName(id: number | null) {
  return agents.value.find((a) => a.id === id)?.name || ''
}

async function setStatus(t: any, status: string) {
  const previous = t.status
  t.status = status
  try {
    await $fetch(`/api/admin/saas/tasks/${t.id}`, { method: 'PATCH', body: { status } })
    toast.success(`Tarea: ${(TASK_STATUS_LABELS[status] || status).toLowerCase()}`)
    refresh()
  } catch (e: any) {
    t.status = previous
    toast.error(e?.data?.statusMessage || 'No se pudo actualizar la tarea')
  }
}

async function remove(t: any) {
  const ok = await confirm(`«${t.title}» irá a la papelera: desaparecerá de los listados y de la próxima acción de su lead. Su actividad se conserva y podrás restaurarla desde «Papelera».`, { title: '¿Mandar la tarea a la papelera?', confirmLabel: 'Mandar a la papelera', danger: true })
  if (!ok) return
  try {
    await $fetch(`/api/admin/saas/tasks/${t.id}`, { method: 'PATCH', body: { deleted: true } })
    toast.success('Tarea enviada a la papelera')
    refresh()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo borrar la tarea')
  }
}

async function restore(t: any) {
  try {
    await $fetch(`/api/admin/saas/tasks/${t.id}`, { method: 'PATCH', body: { deleted: false } })
    toast.success('Tarea restaurada')
    refresh()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo restaurar la tarea')
  }
}

const newTask = ref(false)
const editing = ref<any | null>(null)
function openNewTask() {
  newTask.value = true
}
function onSaved(message: string) {
  newTask.value = false
  editing.value = null
  toast.success(message)
  refresh()
}
</script>
