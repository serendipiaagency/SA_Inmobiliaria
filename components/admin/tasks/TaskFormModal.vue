<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="$emit('close')">
    <div class="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl" role="dialog" aria-modal="true" :aria-label="isEdit ? 'Editar tarea' : 'Nueva tarea'" data-testid="task-form">
      <h3 class="mb-4 text-sm font-semibold">{{ isEdit ? 'Editar tarea' : 'Nueva tarea' }}</h3>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block sm:col-span-2">
          <span class="tf-label">Título</span>
          <input v-model="form.title" type="text" class="input" placeholder="Llamar a María para el feedback de la visita" data-testid="task-form-title" >
        </label>
        <label class="block">
          <span class="tf-label">Tipo</span>
          <select v-model="form.type" class="input" data-testid="task-form-type">
            <option v-for="ty in TASK_TYPES" :key="ty" :value="ty">{{ TASK_TYPE_LABELS[ty] }}</option>
          </select>
        </label>
        <label class="block">
          <span class="tf-label">Prioridad</span>
          <select v-model="form.priority" class="input" data-testid="task-form-priority">
            <option v-for="p in TASK_PRIORITIES" :key="p" :value="p">{{ TASK_PRIORITY_LABELS[p] }}</option>
          </select>
        </label>
        <label class="block">
          <span class="tf-label">Responsable</span>
          <select v-model="form.assigneeId" class="input" data-testid="task-form-assignee">
            <option value="">Sin asignar</option>
            <option v-for="a in agentOptions" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </label>
        <label class="block">
          <span class="tf-label">Fecha y hora</span>
          <input v-model="form.dueAt" type="datetime-local" class="input" data-testid="task-form-due" >
        </label>
        <label class="block">
          <span class="tf-label">Estado</span>
          <select v-model="form.status" class="input" data-testid="task-form-status">
            <option v-for="st in statusOptions" :key="st" :value="st">{{ TASK_STATUS_LABELS[st] }}</option>
          </select>
        </label>
        <!-- Cierre D3a (migración 0089): por defecto, la oficina de su responsable — se calcula al leer, así que sigue al responsable si cambia. -->
        <label class="block">
          <span class="tf-label">Oficina</span>
          <select v-model="form.officeId" class="input" data-testid="task-form-office">
            <option value="">{{ defaultOfficeLabel }}</option>
            <option v-for="o in offices" :key="o.id" :value="o.id">{{ o.label }}</option>
          </select>
        </label>
      </div>

      <p class="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wide text-stone-400">Relacionada con</p>
      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <span class="tf-label">Contacto</span>
          <RecordPicker v-model="rel.contact" kind="contact" :locked="isLocked('contact')" />
        </div>
        <div>
          <span class="tf-label">Lead</span>
          <RecordPicker v-model="rel.lead" kind="lead" :locked="isLocked('lead')" />
        </div>
        <div>
          <span class="tf-label">Propiedad</span>
          <RecordPicker v-model="rel.property" kind="property" :locked="isLocked('property')" />
        </div>
        <div>
          <span class="tf-label">Cita</span>
          <RecordPicker v-model="rel.appointment" kind="appointment" :locked="isLocked('appointment')" />
        </div>
        <div class="sm:col-span-2">
          <span class="tf-label">Operación</span>
          <RecordPicker v-model="rel.deal" kind="deal" :locked="isLocked('deal')" />
        </div>
      </div>
      <p class="mt-2 text-[11px] text-stone-400">Sólo se ofrecen registros de tu inmobiliaria; una propiedad en la papelera no se puede elegir.</p>

      <p v-if="error" class="mt-3 text-sm font-medium text-red-600" data-testid="task-form-error">{{ error }}</p>
      <div class="mt-4 flex justify-end gap-2">
        <button type="button" class="btn-secondary" @click="$emit('close')">Cancelar</button>
        <button type="button" class="btn-primary" :disabled="!form.title.trim() || saving" data-testid="task-form-save" @click="submit">{{ saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear tarea' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import RecordPicker from '~/components/admin/pickers/RecordPicker.vue'
import { loadRelationOptions, type RelationOption } from '~/composables/useRelationOptions'
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_STATUSES, TASK_STATUS_LABELS, TASK_TYPES, TASK_TYPE_LABELS, type PickedRecord } from '~/utils/pipelineCatalog'

/**
 * Alta y edición de una tarea (FASE 22, bloque N6): tipo, título,
 * responsable, fecha, prioridad, estado (también «En curso») y sus
 * relaciones — contacto, lead, propiedad, cita y operación —, cada una
 * elegible y validada por el servidor dentro de la organización. Una
 * pantalla puede fijar relaciones (`locked`), p. ej. la operación desde su
 * propia ficha. Cierre D3a: la oficina de la tarea (vacía = la de su
 * responsable), validada por el servidor en la agencia.
 */
type RelKey = 'contact' | 'lead' | 'property' | 'appointment' | 'deal'

const props = withDefaults(
  defineProps<{
    task?: any | null
    defaults?: Partial<Record<RelKey, PickedRecord | null>> & { assigneeId?: number | null; type?: string; title?: string }
    locked?: RelKey[]
    agents?: { id: number; name: string; officeId?: number | null }[] | null
  }>(),
  { task: null, defaults: () => ({}), locked: () => [], agents: null },
)
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved', task: any): void }>()

const isEdit = computed(() => !!props.task?.id)
const statusOptions = computed(() => (isEdit.value ? [...TASK_STATUSES] : (['open', 'in_progress'] as const)))
function isLocked(k: RelKey) {
  return props.locked.includes(k)
}

function toInput(dbTs: string | null | undefined) {
  return dbTs ? String(dbTs).replace(' ', 'T').slice(0, 16) : ''
}
function toDb(v: string) {
  return v ? `${v.replace('T', ' ')}:00` : null
}

const t = props.task
const form = reactive({
  title: t?.title || props.defaults.title || '',
  type: t?.type || props.defaults.type || 'call',
  priority: t?.priority || 'medium',
  assigneeId: (t ? t.assigneeId : props.defaults.assigneeId) || ('' as number | ''),
  dueAt: toInput(t?.dueAt),
  status: t?.status || 'open',
  officeId: (t?.officeId ?? '') as number | '',
})
const rel = reactive<Record<RelKey, PickedRecord | null>>({
  contact: t ? (t.contactId ? { id: t.contactId, label: t.contactName || `Contacto #${t.contactId}` } : null) : (props.defaults.contact ?? null),
  lead: t ? (t.leadId ? { id: t.leadId, label: t.leadName || `Lead #${t.leadId}` } : null) : (props.defaults.lead ?? null),
  property: t ? (t.propertyId ? { id: t.propertyId, kind: t.propertyKind, label: t.propertyName || `Inmueble #${t.propertyId}` } : null) : (props.defaults.property ?? null),
  appointment: t ? (t.appointmentId ? { id: t.appointmentId, label: t.appointmentLabel || `Cita #${t.appointmentId}` } : null) : (props.defaults.appointment ?? null),
  deal: t ? (t.dealId ? { id: t.dealId, label: `Operación #${t.dealId}` } : null) : (props.defaults.deal ?? null),
})

const agentOptions = ref<{ id: number; name: string; officeId?: number | null }[]>(props.agents || [])
const offices = ref<RelationOption[]>([])
onMounted(async () => {
  loadRelationOptions('offices').then((r) => (offices.value = r))
  if (props.agents) return
  const res = await $fetch<any>('/api/admin/saas/agents').catch(() => null)
  agentOptions.value = res?.rows || []
})
/** La opción vacía dice cuál es «la de su responsable» ahora mismo. */
const defaultOfficeLabel = computed(() => {
  if (!form.assigneeId) return 'Sin oficina propia (la de su responsable)'
  const officeId = agentOptions.value.find((a) => a.id === Number(form.assigneeId))?.officeId
  const name = officeId ? offices.value.find((o) => o.id === officeId)?.label : null
  return name ? `La de su responsable (${name})` : 'La de su responsable (sin oficina)'
})

const saving = ref(false)
const error = ref('')
async function submit() {
  if (!form.title.trim()) return
  saving.value = true
  error.value = ''
  const body: Record<string, any> = {
    title: form.title.trim(),
    type: form.type,
    priority: form.priority,
    assigneeId: form.assigneeId || null,
    dueAt: toDb(form.dueAt),
    status: form.status,
    contactId: rel.contact?.id ?? null,
    leadId: rel.lead?.id ?? null,
    propertyId: rel.property?.id ?? null,
    propertyKind: rel.property ? rel.property.kind || null : null,
    appointmentId: rel.appointment?.id ?? null,
    dealId: rel.deal?.id ?? null,
    officeId: form.officeId || null,
  }
  try {
    const saved = isEdit.value
      ? await $fetch<any>(`/api/admin/saas/tasks/${props.task.id}`, { method: 'PATCH', body })
      : await $fetch<any>('/api/admin/saas/tasks', { method: 'POST', body })
    emit('saved', saved)
  } catch (e: any) {
    error.value = e?.data?.statusMessage || 'No se pudo guardar la tarea'
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.tf-label {
  @apply mb-1 block text-[12px] font-medium text-stone-600;
}
</style>
