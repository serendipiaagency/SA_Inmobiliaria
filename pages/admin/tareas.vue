<template>
  <div>
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Tareas</h1>
        <p class="mt-1 text-sm text-stone-500">{{ rows.length }} tarea{{ rows.length === 1 ? '' : 's' }}</p>
      </div>
      <button type="button" class="btn-primary" @click="openNewTask">+ Nueva tarea</button>
    </div>

    <!-- Filters -->
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <select v-model="bucket" class="rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink">
        <option value="open">Abiertas</option>
        <option value="overdue">Vencidas</option>
        <option value="today">Vencen hoy</option>
        <option value="completed">Completadas</option>
        <option value="all">Todas</option>
      </select>
      <select v-model="assigneeId" class="rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink">
        <option value="">Todos los comerciales</option>
        <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
      </select>
      <select v-model="type" class="rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink">
        <option value="">Todos los tipos</option>
        <option v-for="ty in TASK_TYPES" :key="ty" :value="ty">{{ taskTypeLabel(ty) }}</option>
      </select>
      <select v-model="priority" class="rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink">
        <option value="">Toda prioridad</option>
        <option v-for="p in TASK_PRIORITIES" :key="p" :value="p">{{ taskPriorityLabel(p) }}</option>
      </select>
    </div>

    <AdminPanel :pad="false">
      <div v-if="!rows.length" class="py-16 text-center text-sm text-stone-400">Sin tareas con estos filtros.</div>
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
              <th class="px-2 py-2.5 font-semibold"><span class="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in rows" :key="t.id" class="border-b border-line/60 last:border-0 hover:bg-stone-50">
              <td class="px-4 py-3">
                <p class="font-medium">{{ t.title }}</p>
                <p class="text-xs text-stone-400">{{ taskTypeLabel(t.type) }}</p>
              </td>
              <td class="px-4 py-3 text-xs text-stone-500">
                <NuxtLink v-if="t.contactId" :to="`/admin/contactos/${t.contactId}`" class="hover:underline">Contacto #{{ t.contactId }}</NuxtLink>
                <span v-else-if="t.leadId">Lead #{{ t.leadId }}</span>
                <span v-else-if="t.propertyId">Inmueble #{{ t.propertyId }}</span>
                <span v-else class="text-stone-300">—</span>
              </td>
              <td class="px-4 py-3 text-stone-600">{{ agentName(t.assigneeId) || 'Sin asignar' }}</td>
              <td class="px-4 py-3 text-stone-500">
                <span v-if="t.dueAt" :class="isOverdue(t) ? 'font-medium text-red-600' : ''">{{ formatRelative(t.dueAt) }}</span>
                <span v-else class="text-stone-300">—</span>
              </td>
              <td class="px-4 py-3"><span class="rounded px-1.5 py-0.5 text-xs font-semibold" :class="PRIORITY_CLS[t.priority]">{{ taskPriorityLabel(t.priority) }}</span></td>
              <td class="px-4 py-3"><span class="rounded-full px-2 py-0.5 text-[10px] font-semibold" :class="STATUS_CLS[t.status]">{{ taskStatusLabel(t.status) }}</span></td>
              <td class="px-2 py-3">
                <div v-if="t.status === 'open' || t.status === 'in_progress'" class="flex justify-end gap-1">
                  <button type="button" class="btn-quiet !px-2 !py-1 text-[11px]" @click="setStatus(t, 'completed')">Completar</button>
                  <button type="button" class="btn-quiet !px-2 !py-1 text-[11px] text-stone-400" @click="setStatus(t, 'cancelled')">Cancelar</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AdminPanel>

    <!-- Nueva tarea -->
    <div v-if="newTask" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="newTask = false">
      <div class="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h3 class="mb-4 text-sm font-semibold">Nueva tarea</h3>
        <div class="space-y-3">
          <select v-model="taskForm.type" class="input">
            <option v-for="ty in TASK_TYPES" :key="ty" :value="ty">{{ taskTypeLabel(ty) }}</option>
          </select>
          <input v-model="taskForm.title" type="text" placeholder="Título" class="input" >
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
  </div>
</template>

<script setup lang="ts">
import { formatRelative } from '~/composables/useClientConfig'

/**
 * Tareas (FASE 22): trabajo pendiente de toda la organización, no sólo del
 * comercial que la mira — igual que Calendar, RBAC aquí es por área (`crm`),
 * nunca por fila, así que el filtro "Comercial" organiza la vista, no la
 * restringe (mismo criterio documentado en docs/calendar.md).
 *
 * "+ Nueva tarea" desde aquí crea tareas sueltas, sin relación. Una tarea
 * ligada a un contacto, un lead o el resultado de una visita se crea desde
 * esa ficha — ver docs/tasks.md.
 */
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Tareas — M&M Real Estate' })
const toast = useToast()

const TASK_TYPES = ['call', 'whatsapp', 'email', 'follow_up', 'document', 'viewing', 'offer', 'signature', 'other'] as const
const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const
const TASK_TYPE_LABELS: Record<string, string> = { call: 'Llamada', whatsapp: 'WhatsApp', email: 'Email', follow_up: 'Seguimiento', document: 'Documento', viewing: 'Visita', offer: 'Oferta', signature: 'Firma', other: 'Otro' }
const TASK_PRIORITY_LABELS: Record<string, string> = { low: 'Baja', medium: 'Media', high: 'Alta', urgent: 'Urgente' }
const TASK_STATUS_LABELS: Record<string, string> = { open: 'Abierta', in_progress: 'En curso', completed: 'Completada', cancelled: 'Cancelada' }
const PRIORITY_CLS: Record<string, string> = { low: 'bg-stone-100 text-stone-500', medium: 'bg-blue-50 text-blue-700', high: 'bg-amber-50 text-amber-700', urgent: 'bg-red-50 text-red-700' }
const STATUS_CLS: Record<string, string> = { open: 'bg-blue-50 text-blue-700', in_progress: 'bg-amber-50 text-amber-700', completed: 'bg-emerald-50 text-emerald-700', cancelled: 'bg-stone-100 text-stone-500' }
function taskTypeLabel(t: string) { return TASK_TYPE_LABELS[t] || t }
function taskPriorityLabel(p: string) { return TASK_PRIORITY_LABELS[p] || p }
function taskStatusLabel(s: string) { return TASK_STATUS_LABELS[s] || s }
function isOverdue(t: any) { return (t.status === 'open' || t.status === 'in_progress') && t.dueAt && t.dueAt < new Date().toISOString().replace('T', ' ').slice(0, 19) }

const bucket = ref<'open' | 'overdue' | 'today' | 'completed' | 'all'>('open')
const assigneeId = ref<string | number>('')
const type = ref('')
const priority = ref('')

const query = computed(() => {
  const q: Record<string, any> = {}
  if (bucket.value === 'open') q.status = 'open'
  else if (bucket.value === 'overdue') q.overdue = '1'
  else if (bucket.value === 'today') q.dueToday = '1'
  else if (bucket.value === 'completed') q.status = 'completed'
  if (assigneeId.value) q.assigneeId = assigneeId.value
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
    toast.success(status === 'completed' ? 'Tarea completada' : 'Tarea cancelada')
    refresh()
  } catch {
    t.status = previous
    toast.error('No se pudo actualizar la tarea')
  }
}

const newTask = ref(false)
const taskForm = reactive({ type: 'call' as string, title: '', assigneeId: '' as string | number, dueAt: '', priority: 'medium' as string })
const taskError = ref('')
const savingTask = ref(false)
function openNewTask() {
  taskForm.type = 'call'
  taskForm.title = ''
  taskForm.assigneeId = ''
  taskForm.dueAt = ''
  taskForm.priority = 'medium'
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
        type: taskForm.type,
        title: taskForm.title.trim(),
        assigneeId: taskForm.assigneeId || null,
        dueAt: taskForm.dueAt ? taskForm.dueAt.replace('T', ' ') + ':00' : null,
        priority: taskForm.priority,
      },
    })
    newTask.value = false
    refresh()
    toast.success('Tarea creada')
  } catch (e: any) {
    taskError.value = e?.data?.statusMessage || 'No se pudo crear la tarea'
  } finally {
    savingTask.value = false
  }
}
</script>
