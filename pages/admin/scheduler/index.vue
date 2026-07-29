<template>
  <div>
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Publicación multicanal</h1>
        <p class="mt-1 text-sm text-stone-500">Programa, escalona y sigue la publicación de cada propiedad en {{ channels.length }} canales</p>
      </div>
      <button class="dash-btn-primary" @click="openCreate()">+ Nueva programación</button>
    </div>

    <div class="mb-4 grid gap-4 sm:grid-cols-4">
      <AdminStatCard label="Programadas" :value="String(counts.scheduled)" />
      <AdminStatCard label="Jobs pendientes" :value="String(jobCounts.pending)" />
      <AdminStatCard label="Fallidos" :value="String(jobCounts.failed)" sub="revisa antes de reintentar" />
      <AdminStatCard label="Canales conectados" :value="`${connectedCount} / ${channels.length}`" sub="con credencial real configurada" />
    </div>

    <div class="mb-4 flex gap-1 border-b border-line">
      <button v-for="t in tabs" :key="t.key" class="px-3 py-2 text-sm font-medium transition" :class="tab === t.key ? 'border-b-2 border-ink text-ink' : 'text-stone-400 hover:text-stone-600'" @click="tab = t.key">
        {{ t.label }}
      </button>
    </div>

    <!-- Automatizaciones -->
    <div v-if="tab === 'automations'">
      <p class="mb-3 text-sm text-stone-500">Cuando cambia el precio o el estado de una propiedad, dispara una republicación automática en los canales conectados.</p>
      <div class="mb-3 flex justify-end">
        <button class="dash-btn-primary" @click="openAutomationEditor()">+ Nueva regla</button>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div v-for="r in automations" :key="r.id" class="card flex items-start justify-between p-4">
          <div>
            <p class="font-semibold">{{ r.name }}</p>
            <p class="mt-0.5 text-xs text-stone-500">
              {{ TRIGGER_LABEL[r.triggerType] || r.triggerType }} → {{ ACTION_LABEL[r.actionType] || r.actionType }}
            </p>
          </div>
          <div class="flex items-center gap-2 text-xs">
            <button
              class="relative h-5 w-9 shrink-0 rounded-full transition"
              :class="r.enabled ? 'bg-ink' : 'bg-stone-300'"
              role="switch"
              :aria-checked="!!r.enabled"
              @click="toggleAutomation(r)"
            >
              <span class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all" :class="r.enabled ? 'left-[18px]' : 'left-0.5'" />
            </button>
            <button class="font-medium text-red-600 hover:underline" @click="deleteAutomation(r.id)">Eliminar</button>
          </div>
        </div>
        <p v-if="!automations.length" class="text-sm text-stone-400">Sin reglas todavía.</p>
      </div>
    </div>

    <!-- Programaciones -->
    <div v-if="tab === 'list'">
      <div class="mb-3 flex gap-2">
        <select v-model="statusFilter" class="input !w-48" @change="loadSchedules">
          <option value="">Todos los estados</option>
          <option value="scheduled">Programada</option>
          <option value="in_progress">En curso</option>
          <option value="completed">Completada</option>
          <option value="cancelled">Cancelada</option>
        </select>
      </div>
      <div class="card overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="bg-stone-50 text-xs uppercase text-stone-500">
            <tr>
              <th class="px-4 py-3">Propiedad</th>
              <th class="px-4 py-3">Nombre</th>
              <th class="px-4 py-3">Lanzamiento</th>
              <th class="px-4 py-3">Estado</th>
              <th class="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in schedules" :key="s.id" class="border-t border-line hover:bg-stone-50">
              <td class="px-4 py-3">
                <NuxtLink v-if="s.propertySlug" :to="`/admin/developer-properties/${s.developerPropertyId}`" class="font-medium text-emerald-700 hover:underline">{{ s.propertyName || `#${s.developerPropertyId}` }}</NuxtLink>
                <span v-else class="text-stone-400">#{{ s.developerPropertyId }}</span>
              </td>
              <td class="px-4 py-3">{{ s.name || '—' }}</td>
              <td class="px-4 py-3">{{ dt.dateTime(s.baseScheduledAt) }}</td>
              <td class="px-4 py-3"><StatusBadge :status="s.status" /></td>
              <td class="whitespace-nowrap px-4 py-3 text-right">
                <button class="mr-3 font-medium text-emerald-700 hover:underline" @click="openDetail(s.id)">Ver</button>
                <button class="mr-3 font-medium text-stone-500 hover:underline" @click="duplicate(s.id)">Duplicar</button>
                <button v-if="!['completed', 'cancelled'].includes(s.status)" class="font-medium text-red-600 hover:underline" @click="cancelSchedule(s.id)">Cancelar</button>
              </td>
            </tr>
            <tr v-if="!schedules.length">
              <td colspan="5" class="px-4 py-8 text-center text-sm text-stone-400">Sin programaciones todavía.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Calendario -->
    <div v-else-if="tab === 'calendar'">
      <div class="mb-3 flex items-center gap-3">
        <button class="btn-quiet !px-3 !py-1.5" @click="shiftMonth(-1)">← Mes anterior</button>
        <span class="font-semibold">{{ monthLabel }}</span>
        <button class="btn-quiet !px-3 !py-1.5" @click="shiftMonth(1)">Mes siguiente →</button>
      </div>
      <div class="grid grid-cols-7 gap-1.5 text-xs">
        <div v-for="d in weekdayLabels" :key="d" class="pb-1 text-center font-semibold uppercase text-stone-400">{{ d }}</div>
        <div v-for="(cell, i) in calendarCells" :key="i" class="min-h-[84px] rounded-lg border border-line p-1.5" :class="cell.inMonth ? 'bg-white' : 'bg-stone-50 text-stone-300'">
          <div class="mb-1 text-right font-medium">{{ cell.day }}</div>
          <div class="space-y-0.5">
            <div v-for="j in cell.jobs.slice(0, 3)" :key="j.id" class="truncate rounded px-1 py-0.5 text-[10px]" :class="jobDotClass(j.status)" :title="`${j.propertyName || ''} · ${j.channelKey} · ${j.status}`" @click="openDetail(j.scheduleId)">
              {{ j.propertyName || '—' }} · {{ CHANNEL_LABEL[j.channelKey] || j.channelKey }}
            </div>
            <div v-if="cell.jobs.length > 3" class="text-[10px] text-stone-400">+{{ cell.jobs.length - 3 }} más</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Plantillas -->
    <div v-else-if="tab === 'templates'">
      <div class="mb-3 flex justify-end">
        <button class="dash-btn-primary" @click="openTemplateEditor(null)">+ Nueva plantilla</button>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div v-for="t in templates" :key="t.id" class="card p-4">
          <div class="flex items-start justify-between">
            <div>
              <p class="font-semibold">{{ t.name }}</p>
              <p class="mt-0.5 text-xs text-stone-500">{{ t.description || 'Sin descripción' }}</p>
            </div>
            <div class="flex gap-2 text-xs">
              <button class="font-medium text-emerald-700 hover:underline" @click="openTemplateEditor(t)">Editar</button>
              <button class="font-medium text-red-600 hover:underline" @click="deleteTemplate(t.id)">Eliminar</button>
            </div>
          </div>
          <div class="mt-2 flex flex-wrap gap-1">
            <span v-for="(step, i) in t.steps" :key="i" class="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
              {{ CHANNEL_LABEL[step.channelKey] || step.channelKey }} · +{{ step.offsetMinutes }}min
            </span>
          </div>
        </div>
        <p v-if="!templates.length" class="text-sm text-stone-400">Sin plantillas todavía — crea una para reutilizar la misma secuencia de canales en varias propiedades.</p>
      </div>
    </div>

    <!-- Modal: crear programación -->
    <div v-if="showCreate" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="showCreate = false">
      <div class="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6">
        <h2 class="mb-4 text-lg font-semibold">Nueva programación</h2>

        <label class="label">Propiedad</label>
        <input v-model="propertyQuery" class="input mb-1" placeholder="Buscar propiedad por nombre…" @input="searchProperties" />
        <div v-if="propertyResults.length" class="mb-3 max-h-32 overflow-y-auto rounded-lg border border-line">
          <button v-for="p in propertyResults" :key="p.id" class="block w-full px-3 py-2 text-left text-sm hover:bg-stone-50" @click="selectProperty(p)">{{ p.name }}</button>
        </div>
        <p v-if="selectedProperty" class="mb-3 text-sm text-emerald-700">Seleccionada: {{ selectedProperty.name }}</p>

        <label class="label">Fecha/hora de lanzamiento (canal base)</label>
        <input v-model="createForm.baseScheduledAt" type="datetime-local" class="input mb-3" />

        <label class="label">Plantilla (opcional — o define los canales a mano abajo)</label>
        <select v-model="createForm.templateId" class="input mb-3">
          <option value="">— Sin plantilla —</option>
          <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }}</option>
        </select>

        <div v-if="!createForm.templateId">
          <label class="label">Canales y orden de lanzamiento (offset en minutos desde el canal base)</label>
          <div v-for="(step, i) in createForm.steps" :key="i" class="mb-2 flex items-center gap-2">
            <select v-model="step.channelKey" class="input !w-40">
              <option v-for="c in channels" :key="c.key" :value="c.key">{{ c.label }}{{ c.connected ? '' : ' (no conectado)' }}</option>
            </select>
            <input v-model.number="step.offsetMinutes" type="number" class="input !w-24" placeholder="min" />
            <select v-model="step.priority" class="input !w-28">
              <option v-for="p in PRIORITIES" :key="p" :value="p">{{ p }}</option>
            </select>
            <button class="text-red-600" title="Quitar" @click="createForm.steps.splice(i, 1)">✕</button>
          </div>
          <button class="btn-quiet !px-3 !py-1.5" @click="createForm.steps.push({ channelKey: channels[0]?.key || 'own_web', offsetMinutes: 0, priority: 'normal' })">+ Añadir canal</button>
        </div>

        <div class="mt-6 flex justify-end gap-2">
          <button class="btn-secondary" @click="showCreate = false">Cancelar</button>
          <button class="btn-primary" :disabled="creating" @click="submitCreate">{{ creating ? 'Creando…' : 'Crear programación' }}</button>
        </div>
      </div>
    </div>

    <!-- Modal: detalle de programación -->
    <div v-if="detail" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="detail = null">
      <div class="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-lg font-semibold">{{ detail.schedule.name || `Programación #${detail.schedule.id}` }}</h2>
          <button class="text-stone-400 hover:text-stone-600" @click="detail = null">✕</button>
        </div>

        <table class="mb-4 w-full text-left text-sm">
          <thead class="bg-stone-50 text-xs uppercase text-stone-500">
            <tr>
              <th class="px-3 py-2">Canal</th>
              <th class="px-3 py-2">Cuándo</th>
              <th class="px-3 py-2">Prioridad</th>
              <th class="px-3 py-2">Estado</th>
              <th class="px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="j in detail.jobs" :key="j.id" class="border-t border-line">
              <td class="px-3 py-2">{{ CHANNEL_LABEL[j.channelKey] || j.channelKey }}</td>
              <td class="px-3 py-2">{{ dt.dateTime(j.runAt) }}</td>
              <td class="px-3 py-2">
                <select :value="j.priority" class="input !w-28 !py-1 text-xs" @change="changePriority(j, ($event.target as HTMLSelectElement).value)">
                  <option v-for="p in PRIORITIES" :key="p" :value="p">{{ p }}</option>
                </select>
              </td>
              <td class="px-3 py-2">
                <StatusBadge :status="j.status" />
                <span v-if="j.lastError" class="ml-1 text-[11px] text-red-500" :title="j.lastError">⚠</span>
              </td>
              <td class="whitespace-nowrap px-3 py-2 text-right text-xs">
                <button v-if="['pending', 'paused', 'failed'].includes(j.status)" class="mr-2 font-medium text-emerald-700 hover:underline" @click="runJob(j)">Publicar ahora</button>
                <button v-if="['pending', 'retrying'].includes(j.status)" class="mr-2 font-medium text-stone-500 hover:underline" @click="pauseJob(j)">Pausar</button>
                <button v-if="j.status === 'paused'" class="mr-2 font-medium text-stone-500 hover:underline" @click="resumeJob(j)">Reanudar</button>
                <button v-if="j.status === 'failed'" class="font-medium text-amber-600 hover:underline" @click="retryJob(j)">Reintentar</button>
              </td>
            </tr>
          </tbody>
        </table>

        <h3 class="mb-2 text-sm font-semibold text-stone-500">Historial</h3>
        <ul class="space-y-1.5 text-xs text-stone-500">
          <li v-for="h in history" :key="h.id">
            <span class="font-medium text-stone-700">{{ dt.dateTime(h.createdAt) }}</span> — {{ h.message }}
          </li>
          <li v-if="!history.length" class="text-stone-400">Sin eventos todavía.</li>
        </ul>
      </div>
    </div>

    <!-- Modal: nueva regla de automatización -->
    <div v-if="automationEditor" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="automationEditor = null">
      <div class="w-full max-w-md rounded-xl bg-white p-6">
        <h2 class="mb-4 text-lg font-semibold">Nueva regla</h2>
        <label class="label">Nombre</label>
        <input v-model="automationEditor.name" class="input mb-3" placeholder="p. ej. Republicar en bajada de precio" />
        <label class="label">Cuándo (disparador)</label>
        <select v-model="automationEditor.triggerType" class="input mb-3">
          <option value="price_drop">Bajada de precio</option>
          <option value="status_change">Cambio de estado</option>
        </select>
        <label class="label">Qué hacer</label>
        <select v-model="automationEditor.actionType" class="input mb-3">
          <option value="update_all">Republicar todo</option>
          <option value="update_images">Actualizar solo fotos</option>
          <option value="update_text">Actualizar solo texto/precio</option>
          <option value="unpublish">Despublicar</option>
        </select>
        <div class="mt-6 flex justify-end gap-2">
          <button class="btn-secondary" @click="automationEditor = null">Cancelar</button>
          <button class="btn-primary" @click="saveAutomation">Crear regla</button>
        </div>
      </div>
    </div>

    <!-- Modal: editor de plantilla -->
    <div v-if="templateEditor" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="templateEditor = null">
      <div class="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6">
        <h2 class="mb-4 text-lg font-semibold">{{ templateEditor.id ? 'Editar plantilla' : 'Nueva plantilla' }}</h2>
        <label class="label">Nombre</label>
        <input v-model="templateEditor.name" class="input mb-3" />
        <label class="label">Descripción</label>
        <input v-model="templateEditor.description" class="input mb-3" />
        <label class="label">Canales</label>
        <div v-for="(step, i) in templateEditor.steps" :key="i" class="mb-2 flex items-center gap-2">
          <select v-model="step.channelKey" class="input !w-40">
            <option v-for="c in channels" :key="c.key" :value="c.key">{{ c.label }}</option>
          </select>
          <input v-model.number="step.offsetMinutes" type="number" class="input !w-24" placeholder="min" />
          <button class="text-red-600" @click="templateEditor.steps.splice(i, 1)">✕</button>
        </div>
        <button class="btn-quiet !px-3 !py-1.5" @click="templateEditor.steps.push({ channelKey: channels[0]?.key || 'own_web', offsetMinutes: 0, priority: 'normal' })">+ Añadir canal</button>
        <div class="mt-6 flex justify-end gap-2">
          <button class="btn-secondary" @click="templateEditor = null">Cancelar</button>
          <button class="btn-primary" @click="saveTemplate">Guardar</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Publicación multicanal — M&M Real Estate' })
const dt = useDash()
const toast = useToast()

const PRIORITIES = ['low', 'normal', 'high', 'urgent']

const tab = ref<'list' | 'calendar' | 'templates' | 'automations'>('list')
const tabs = [
  { key: 'list', label: 'Programaciones' },
  { key: 'calendar', label: 'Calendario' },
  { key: 'templates', label: 'Plantillas' },
  { key: 'automations', label: 'Automatizaciones' },
]

const TRIGGER_LABEL: Record<string, string> = { price_drop: 'Bajada de precio', status_change: 'Cambio de estado' }
const ACTION_LABEL: Record<string, string> = { update_all: 'Republicar todo', update_images: 'Actualizar fotos', update_text: 'Actualizar texto/precio', unpublish: 'Despublicar' }

const channels = ref<any[]>([])
const templates = ref<any[]>([])
const schedules = ref<any[]>([])
const statusFilter = ref('')
const connectedCount = computed(() => channels.value.filter((c) => c.connected).length)
const CHANNEL_LABEL = computed<Record<string, string>>(() => Object.fromEntries(channels.value.map((c) => [c.key, c.label])))
const counts = computed(() => ({ scheduled: schedules.value.filter((s) => s.status === 'scheduled').length }))
const jobCounts = ref({ pending: 0, failed: 0 })

async function loadChannels() {
  const r = await $fetch<any>('/api/admin/scheduler/channels')
  channels.value = r.rows
}
async function loadTemplates() {
  const r = await $fetch<any>('/api/admin/scheduler/templates')
  templates.value = r.rows
}
async function loadSchedules() {
  const r = await $fetch<any>('/api/admin/scheduler/schedules', { query: statusFilter.value ? { status: statusFilter.value } : {} })
  schedules.value = r.rows
}
async function loadJobCounts() {
  const [pending, failed] = await Promise.all([
    $fetch<any>('/api/admin/scheduler/jobs', { query: { status: 'pending' } }),
    $fetch<any>('/api/admin/scheduler/jobs', { query: { status: 'failed' } }),
  ])
  jobCounts.value = { pending: pending.rows.length, failed: failed.rows.length }
}

const automations = ref<any[]>([])
async function loadAutomations() {
  const r = await $fetch<any>('/api/admin/scheduler/automations')
  automations.value = r.rows
}

onMounted(async () => {
  await Promise.all([loadChannels(), loadTemplates(), loadSchedules(), loadJobCounts(), loadCalendar(), loadAutomations()])
})

const automationEditor = ref<{ name: string; triggerType: string; actionType: string } | null>(null)
function openAutomationEditor() {
  automationEditor.value = { name: '', triggerType: 'price_drop', actionType: 'update_all' }
}
async function saveAutomation() {
  if (!automationEditor.value) return
  if (!automationEditor.value.name.trim()) return toast.error('El nombre es obligatorio')
  try {
    await $fetch('/api/admin/scheduler/automations', { method: 'POST', body: automationEditor.value })
    toast.success('Regla creada')
    automationEditor.value = null
    await loadAutomations()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo crear la regla')
  }
}
async function toggleAutomation(r: any) {
  const next = r.enabled ? 0 : 1
  r.enabled = next
  try {
    await $fetch(`/api/admin/scheduler/automations/${r.id}`, { method: 'PUT', body: { enabled: !!next } })
  } catch {
    r.enabled = next ? 0 : 1
    toast.error('No se pudo actualizar la regla')
  }
}
async function deleteAutomation(id: number) {
  await $fetch(`/api/admin/scheduler/automations/${id}`, { method: 'DELETE' })
  toast.info('Regla eliminada')
  await loadAutomations()
}

// --- Crear programación ---
const showCreate = ref(false)
const creating = ref(false)
const propertyQuery = ref('')
const propertyResults = ref<any[]>([])
const selectedProperty = ref<any>(null)
const createForm = ref<{ baseScheduledAt: string; templateId: string; steps: any[] }>({ baseScheduledAt: '', templateId: '', steps: [] })

function openCreate() {
  selectedProperty.value = null
  propertyQuery.value = ''
  propertyResults.value = []
  createForm.value = { baseScheduledAt: '', templateId: '', steps: [{ channelKey: 'own_web', offsetMinutes: 0, priority: 'normal' }] }
  showCreate.value = true
}
let searchTimer: any = null
function searchProperties() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(async () => {
    if (!propertyQuery.value.trim()) return (propertyResults.value = [])
    const r = await $fetch<any>('/api/admin/developer-properties', { query: { q: propertyQuery.value, perPage: 8 } })
    propertyResults.value = r.rows
  }, 250)
}
function selectProperty(p: any) {
  selectedProperty.value = p
  propertyResults.value = []
  propertyQuery.value = p.name
}
async function submitCreate() {
  if (!selectedProperty.value) return toast.error('Elige una propiedad')
  if (!createForm.value.baseScheduledAt) return toast.error('Indica la fecha/hora de lanzamiento')
  creating.value = true
  try {
    await $fetch('/api/admin/scheduler/create', {
      method: 'POST',
      body: {
        developerPropertyId: selectedProperty.value.id,
        baseScheduledAt: createForm.value.baseScheduledAt.replace('T', ' ') + ':00',
        templateId: createForm.value.templateId || undefined,
        steps: createForm.value.templateId ? undefined : createForm.value.steps,
      },
    })
    toast.success('Programación creada')
    showCreate.value = false
    await Promise.all([loadSchedules(), loadJobCounts(), loadCalendar()])
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo crear la programación')
  } finally {
    creating.value = false
  }
}

// --- Detalle ---
const detail = ref<{ schedule: any; jobs: any[] } | null>(null)
const history = ref<any[]>([])
async function openDetail(scheduleId: number) {
  const [status, hist] = await Promise.all([
    $fetch<any>('/api/admin/scheduler/status', { query: { scheduleId } }),
    $fetch<any>('/api/admin/scheduler/history', { query: { scheduleId } }),
  ])
  detail.value = status
  history.value = hist.rows
}
async function refreshDetail() {
  if (detail.value) await openDetail(detail.value.schedule.id)
}
async function runJob(j: any) {
  try {
    const r = await $fetch<any>('/api/admin/scheduler/run', { method: 'POST', body: { jobId: j.id } })
    toast[r.outcome === 'success' ? 'success' : 'error'](r.message || `Resultado: ${r.outcome}`)
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo publicar')
  }
  await refreshDetail()
}
async function pauseJob(j: any) {
  await $fetch('/api/admin/scheduler/pause', { method: 'POST', body: { jobId: j.id } })
  await refreshDetail()
}
async function resumeJob(j: any) {
  await $fetch('/api/admin/scheduler/resume', { method: 'POST', body: { jobId: j.id } })
  await refreshDetail()
}
async function retryJob(j: any) {
  await $fetch('/api/admin/scheduler/retry', { method: 'POST', body: { jobId: j.id } })
  await refreshDetail()
}
async function changePriority(j: any, priority: string) {
  await $fetch('/api/admin/scheduler/priority', { method: 'POST', body: { jobId: j.id, priority } })
  await refreshDetail()
}
async function duplicate(scheduleId: number) {
  try {
    await $fetch('/api/admin/scheduler/duplicate', { method: 'POST', body: { scheduleId } })
    toast.success('Programación duplicada')
    await loadSchedules()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo duplicar')
  }
}
async function cancelSchedule(scheduleId: number) {
  await $fetch('/api/admin/scheduler/delete', { method: 'POST', body: { scheduleId } })
  toast.info('Programación cancelada')
  await loadSchedules()
}

// --- Plantillas ---
const templateEditor = ref<{ id: number | null; name: string; description: string; steps: any[] } | null>(null)
function openTemplateEditor(t: any) {
  templateEditor.value = t
    ? { id: t.id, name: t.name, description: t.description || '', steps: JSON.parse(JSON.stringify(t.steps)) }
    : { id: null, name: '', description: '', steps: [{ channelKey: channels.value[0]?.key || 'own_web', offsetMinutes: 0, priority: 'normal' }] }
}
async function saveTemplate() {
  if (!templateEditor.value) return
  const { id, name, description, steps } = templateEditor.value
  if (!name.trim()) return toast.error('El nombre es obligatorio')
  try {
    if (id) await $fetch(`/api/admin/scheduler/templates/${id}`, { method: 'PUT', body: { name, description, steps } })
    else await $fetch('/api/admin/scheduler/templates', { method: 'POST', body: { name, description, steps } })
    toast.success('Plantilla guardada')
    templateEditor.value = null
    await loadTemplates()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo guardar la plantilla')
  }
}
async function deleteTemplate(id: number) {
  await $fetch(`/api/admin/scheduler/templates/${id}`, { method: 'DELETE' })
  toast.info('Plantilla eliminada')
  await loadTemplates()
}

// --- Calendario ---
const calendarMonth = ref(new Date())
const weekdayLabels = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const calendarJobs = ref<any[]>([])
const monthLabel = computed(() => calendarMonth.value.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }))

async function loadCalendar() {
  const y = calendarMonth.value.getFullYear()
  const m = calendarMonth.value.getMonth()
  const from = new Date(y, m, 1).toISOString().slice(0, 10) + ' 00:00:00'
  const to = new Date(y, m + 1, 0).toISOString().slice(0, 10) + ' 23:59:59'
  const r = await $fetch<any>('/api/admin/scheduler/jobs', { query: { from, to } })
  calendarJobs.value = r.rows
}
function shiftMonth(delta: number) {
  calendarMonth.value = new Date(calendarMonth.value.getFullYear(), calendarMonth.value.getMonth() + delta, 1)
  loadCalendar()
}
const calendarCells = computed(() => {
  const y = calendarMonth.value.getFullYear()
  const m = calendarMonth.value.getMonth()
  const firstDay = new Date(y, m, 1)
  const startOffset = (firstDay.getDay() + 6) % 7 // Monday-first grid
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const cells: { day: number; inMonth: boolean; date: string; jobs: any[] }[] = []
  for (let i = 0; i < startOffset; i++) cells.push({ day: 0, inMonth: false, date: '', jobs: [] })
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({ day: d, inMonth: true, date: dateStr, jobs: calendarJobs.value.filter((j) => j.runAt.slice(0, 10) === dateStr) })
  }
  return cells
})
function jobDotClass(status: string) {
  return (
    {
      pending: 'bg-blue-50 text-blue-700',
      running: 'bg-amber-50 text-amber-700',
      success: 'bg-emerald-50 text-emerald-700',
      failed: 'bg-red-50 text-red-700',
      paused: 'bg-stone-100 text-stone-500',
      retrying: 'bg-amber-50 text-amber-700',
      cancelled: 'bg-stone-100 text-stone-400',
    }[status] || 'bg-stone-100 text-stone-500'
  )
}
</script>

<style scoped>
.dash-btn-primary {
  @apply inline-flex items-center rounded-lg bg-ink px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-black;
}
</style>
