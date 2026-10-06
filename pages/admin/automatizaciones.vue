<!--
  Automatizaciones (FASE 34, bloque N8b) — reglas REALES «cuando pase X, si
  se cumple Y, haz Z» sobre hechos del CRM, que ejecuta el motor
  server/utils/automations/engine.ts cada minuto (o al pulsar «Procesar
  ahora»). API: recurso genérico /api/admin/automations (área CRM).

  Antes esta pantalla enseñaba filas de demostración con contadores
  inventados que nada ejecutaba. Esas filas siguen en la base (nada se borra
  en una migración) pero van aparte, marcadas como heredadas: no se pueden
  activar y no suman en ningún contador; se pueden eliminar.
-->
<template>
  <div class="mx-auto max-w-5xl">
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Automatizaciones</h1>
        <p class="mt-1 text-sm text-stone-500">Cuando pase algo en el CRM y se cumpla lo que digas, el sistema lo hace — con tus permisos y dejando registro.</p>
      </div>
      <button type="button" class="dash-btn-primary" data-testid="automation-new" @click="openForm()">+ Nueva automatización</button>
    </div>

    <div v-if="summary" class="mb-5 grid gap-4 sm:grid-cols-3">
      <AdminStatCard label="Activas" :value="`${summary.active} / ${summary.total}`" />
      <AdminStatCard label="Ejecuciones" :value="dt.num(summary.totalRuns)" sub="acciones ejecutadas de verdad" />
      <AdminStatCard label="Con error" :value="dt.num(summary.totalErrors)" sub="ver el registro de cada una" />
    </div>

    <!-- Alta / edición -->
    <AdminPanel v-if="form" :title="form.id ? 'Editar automatización' : 'Nueva automatización'" class="mb-5" data-testid="automation-form">
      <div class="grid gap-4 text-sm">
        <div class="grid gap-3 sm:grid-cols-2">
          <label>
            <span class="lbl">Nombre</span>
            <input v-model="form.name" class="cfg-input" maxlength="120" data-testid="automation-name">
          </label>
          <label>
            <span class="lbl">Descripción (opcional)</span>
            <input v-model="form.description" class="cfg-input" maxlength="500">
          </label>
        </div>

        <div>
          <span class="lbl">1 · Cuando…</span>
          <select v-model="form.trigger" class="cfg-input" data-testid="automation-trigger" @change="form.conditions = []">
            <option v-for="t in AUTOMATION_TRIGGERS" :key="t" :value="t">{{ AUTOMATION_TRIGGER_LABELS[t] }}</option>
          </select>
          <p class="mt-1 text-xs text-stone-500">{{ AUTOMATION_TRIGGER_HELP[form.trigger as AutomationTrigger] }}</p>
        </div>

        <div>
          <span class="lbl">2 · Si se cumple todo esto (opcional)</span>
          <div v-for="(c, i) in form.conditions" :key="i" class="mb-2 grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto]" :data-testid="`automation-condition-${i}`">
            <select v-model="c.field" class="cfg-input" @change="onFieldChange(c)">
              <option v-for="f in fieldsForTrigger" :key="f.key" :value="f.key">{{ f.label }}</option>
            </select>
            <select v-model="c.op" class="cfg-input">
              <option v-for="op in fieldDef(c.field)?.ops || []" :key="op" :value="op">{{ CONDITION_OP_LABELS[op] }}</option>
            </select>
            <template v-if="c.op === 'empty' || c.op === 'not_empty'"><span /></template>
            <select v-else-if="fieldDef(c.field)?.type === 'ref'" v-model="c.value" class="cfg-input">
              <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
            <input v-else-if="fieldDef(c.field)?.type === 'number'" v-model.number="c.value" type="number" min="0" class="cfg-input">
            <div v-else-if="c.op === 'in'" class="flex flex-wrap gap-x-3 gap-y-1 rounded-lg border border-line px-2 py-1.5 text-xs">
              <label v-for="o in fieldDef(c.field)?.options || []" :key="o" class="flex items-center gap-1"><input v-model="c.value" type="checkbox" :value="o"> {{ fieldDef(c.field)?.optionLabels?.[o] || o }}</label>
            </div>
            <select v-else v-model="c.value" class="cfg-input">
              <option v-for="o in fieldDef(c.field)?.options || []" :key="o" :value="o">{{ fieldDef(c.field)?.optionLabels?.[o] || o }}</option>
            </select>
            <button type="button" class="text-xs text-stone-500 hover:text-red-700" @click="form.conditions.splice(i, 1)">Quitar</button>
          </div>
          <button v-if="form.conditions.length < 5 && fieldsForTrigger.length" type="button" class="text-xs font-medium text-stone-600 hover:text-ink" data-testid="automation-add-condition" @click="addCondition">+ Añadir condición</button>
        </div>

        <div>
          <span class="lbl">3 · Haz esto</span>
          <select v-model="form.action" class="cfg-input" data-testid="automation-action">
            <option v-for="a in AUTOMATION_ACTIONS" :key="a" :value="a">{{ AUTOMATION_ACTION_LABELS[a] }}</option>
          </select>
          <div class="mt-3 grid gap-3 sm:grid-cols-2">
            <template v-if="form.action === 'create_task'">
              <label class="sm:col-span-2"><span class="lbl">Título de la tarea</span><input v-model="form.config.title" class="cfg-input" maxlength="200" data-testid="automation-task-title"></label>
              <label><span class="lbl">Tipo</span>
                <select v-model="form.config.type" class="cfg-input"><option v-for="t in TASK_TYPES" :key="t" :value="t">{{ TASK_TYPE_LABELS[t] }}</option></select>
              </label>
              <label><span class="lbl">Vence en (horas)</span><input v-model.number="form.config.dueInHours" type="number" min="0" max="720" class="cfg-input"></label>
              <label><span class="lbl">Responsable</span>
                <select v-model="form.config.assignee" class="cfg-input">
                  <option value="lead_commercial">El comercial del lead</option>
                  <option value="member">Una persona concreta</option>
                  <option value="none">Sin responsable</option>
                </select>
              </label>
              <label v-if="form.config.assignee === 'member'"><span class="lbl">Persona</span>
                <select v-model="form.config.assigneeId" class="cfg-input"><option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option></select>
              </label>
            </template>
            <label v-else-if="form.action === 'assign_lead'"><span class="lbl">Comercial</span>
              <select v-model="form.config.commercialId" class="cfg-input" data-testid="automation-commercial"><option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option></select>
            </label>
            <label v-else-if="form.action === 'change_lead_stage'"><span class="lbl">Nueva etapa del lead</span>
              <select v-model="form.config.stage" class="cfg-input"><option v-for="s in LEAD_STAGES" :key="s" :value="s">{{ LEAD_STAGE_LABELS[s] }}</option></select>
            </label>
            <label v-else-if="form.action === 'create_note'" class="sm:col-span-2"><span class="lbl">Texto de la nota</span><textarea v-model="form.config.body" rows="2" maxlength="1000" class="cfg-input" /></label>
            <label v-else-if="form.action === 'notify_team'" class="sm:col-span-2"><span class="lbl">Aviso (aparece en la campana del panel)</span><input v-model="form.config.message" class="cfg-input" maxlength="300" data-testid="automation-message"></label>
          </div>
          <p v-if="['create_task', 'create_note', 'notify_team'].includes(form.action)" class="mt-2 text-xs text-stone-500">
            Puedes usar: <span v-for="(label, v) in AUTOMATION_TEMPLATE_VARS" :key="v" class="mr-2"><code>{{ v }}</code> ({{ label.toLowerCase() }})</span>
          </p>
          <p class="mt-2 text-xs text-stone-500">No hay envíos a clientes (WhatsApp, email): en este panel los confirma siempre una persona, y una automatización no puede confirmar por nadie.</p>
        </div>

        <p class="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-600">Se ejecutará con <strong>tus</strong> permisos y en tu agencia. Si mañana pierdes el permiso, sus ejecuciones fallarán y quedará registrado. Lo que ya pasó antes de guardarla no la dispara.</p>
        <p v-if="formError" class="text-sm text-red-700" data-testid="automation-form-error">{{ formError }}</p>
        <div class="flex gap-2">
          <button type="button" class="dash-btn-primary" :disabled="saving" data-testid="automation-save" @click="save">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
          <button type="button" class="rounded-lg border border-line px-3.5 py-2 text-[13px]" @click="form = null">Cancelar</button>
        </div>
      </div>
    </AdminPanel>

    <p v-if="!real.length && !form" class="rounded-xl border border-dashed border-line p-6 text-sm text-stone-500" data-testid="automations-empty">
      Todavía no hay automatizaciones. Crea la primera: por ejemplo, «cuando entre un lead del portal sin comercial, crea una tarea de llamada para hoy».
    </p>

    <div class="grid gap-3" data-testid="automations-list">
      <div v-for="a in real" :key="a.id" class="rounded-xl border border-line bg-white p-4" :data-testid="`automation-${a.id}`">
        <div class="flex items-start gap-4">
          <span class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" :class="a.enabled ? 'bg-ink text-white' : 'bg-stone-100 text-stone-400'">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2 3 14h9l-1 8 10-12h-9z" /></svg>
          </span>
          <div class="min-w-0 flex-1">
            <p class="font-semibold">{{ a.name }}</p>
            <p v-if="a.description" class="mt-0.5 text-sm text-stone-500">{{ a.description }}</p>
            <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span class="rounded-md bg-blue-50 px-2 py-0.5 font-medium text-blue-700">{{ a.triggerLabel }}</span>
              <span v-for="(c, i) in a.conditions" :key="i" class="rounded-md bg-amber-50 px-2 py-0.5 text-amber-800">si {{ describeCondition(c) }}</span>
              <span class="text-stone-300">→</span>
              <span class="rounded-md bg-stone-100 px-2 py-0.5 font-medium text-stone-600">{{ a.actionLabel }}</span>
            </div>
            <p class="mt-2 text-xs text-stone-400">
              {{ dt.num(a.runsCount) }} ejecuciones<template v-if="a.errorCount"> · <span class="text-red-700">{{ a.errorCount }} con error</span></template>
              · última {{ a.lastRunAt ? dt.relative(a.lastRunAt) : 'nunca' }}
              <template v-if="a.configuredByName"> · se ejecuta con los permisos de {{ a.configuredByName }}</template>
            </p>
            <p v-if="a.lastError" class="mt-1 text-xs text-red-700">Último error: {{ a.lastError }}</p>
            <div class="mt-3 flex flex-wrap gap-3 text-xs font-medium">
              <button type="button" class="text-stone-600 hover:text-ink" :data-testid="`automation-runs-${a.id}`" @click="toggleRuns(a)">{{ openRuns[a.id] ? 'Ocultar registro' : 'Ver registro' }}</button>
              <button type="button" class="text-stone-600 hover:text-ink disabled:opacity-50" :disabled="!a.enabled || runningId === a.id" :data-testid="`automation-run-now-${a.id}`" @click="runNow(a)">{{ runningId === a.id ? 'Procesando…' : 'Procesar ahora' }}</button>
              <button type="button" class="text-stone-600 hover:text-ink" @click="openForm(a)">Editar</button>
              <button type="button" class="text-red-700 hover:underline" :data-testid="`automation-delete-${a.id}`" @click="remove(a)">Eliminar</button>
            </div>
          </div>
          <button
            type="button"
            class="relative mt-1 h-6 w-11 shrink-0 rounded-full transition active:scale-95"
            :class="a.enabled ? 'bg-ink' : 'bg-stone-300'"
            role="switch"
            :aria-checked="!!a.enabled"
            :aria-label="a.enabled ? 'Desactivar' : 'Activar'"
            :data-testid="`automation-toggle-${a.id}`"
            @click="toggle(a)"
          >
            <span class="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" :class="a.enabled ? 'left-[22px]' : 'left-0.5'" />
          </button>
        </div>

        <div v-if="openRuns[a.id]" class="mt-3 overflow-x-auto border-t border-line pt-3" :data-testid="`automation-runlog-${a.id}`">
          <p v-if="!openRuns[a.id]?.length" class="text-xs text-stone-400">Todavía no se ha disparado.</p>
          <table v-else class="w-full text-left text-xs">
            <thead class="text-stone-400"><tr><th class="py-1 pr-3 font-medium">Cuándo</th><th class="pr-3 font-medium">Qué la disparó</th><th class="pr-3 font-medium">Resultado</th><th class="font-medium">Detalle</th></tr></thead>
            <tbody>
              <tr v-for="r in openRuns[a.id]" :key="r.id" class="border-t border-line align-top">
                <td class="whitespace-nowrap py-1.5 pr-3">{{ dt.dateTime(r.createdAt) }}</td>
                <td class="pr-3">{{ ENTITY_NOUN[r.entityType] || r.entityType }} #{{ r.entityId }} <span class="text-stone-400">({{ r.eventKey }})</span></td>
                <td class="pr-3"><span class="rounded px-1.5 py-0.5" :class="RUN_CLASS[r.status] || 'bg-stone-100'">{{ AUTOMATION_RUN_STATUS_LABELS[r.status] || r.status }}</span></td>
                <td>{{ r.errorCode ? `${r.errorCode}: ` : '' }}{{ r.message || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Demo heredada: visible, marcada, nunca ejecutada -->
    <details v-if="legacy.length" class="mt-8 rounded-xl border border-line bg-stone-50 p-4 text-sm" data-testid="automations-legacy">
      <summary class="cursor-pointer font-medium text-stone-600">Reglas de demostración heredadas ({{ legacy.length }}) — nunca se han ejecutado</summary>
      <p class="mt-2 text-xs text-stone-500">Venían con los datos de ejemplo de la plataforma. Sus contadores eran inventados y sus acciones (emails, Slack, facturas, redes) no existen en el motor, así que no se pueden activar ni cuentan en nada. Puedes eliminarlas.</p>
      <ul class="mt-3 divide-y divide-line">
        <li v-for="a in legacy" :key="a.id" class="flex items-center gap-3 py-2" :data-testid="`automation-legacy-${a.id}`">
          <span class="min-w-0 flex-1"><span class="font-medium">{{ a.name }}</span> <span class="text-xs text-stone-400">· {{ a.trigger }} → {{ a.action }} · demo heredada, no se ejecuta</span></span>
          <button type="button" class="text-xs text-red-700 hover:underline" :data-testid="`automation-legacy-delete-${a.id}`" @click="remove(a)">Eliminar</button>
        </li>
      </ul>
    </details>
  </div>
</template>

<script setup lang="ts">
import AdminPanel from '~/components/admin/Panel.vue'
import AdminStatCard from '~/components/admin/StatCard.vue'
import {
  AUTOMATION_ACTIONS,
  AUTOMATION_ACTION_LABELS,
  AUTOMATION_RUN_STATUS_LABELS,
  AUTOMATION_TEMPLATE_VARS,
  AUTOMATION_TRIGGERS,
  AUTOMATION_TRIGGER_HELP,
  AUTOMATION_TRIGGER_LABELS,
  CONDITION_FIELDS,
  CONDITION_OP_LABELS,
  conditionFieldsFor,
  type AutomationTrigger,
} from '~/utils/automationCatalog'
import { LEAD_STAGES, LEAD_STAGE_LABELS } from '~/utils/leadCatalog'
import { TASK_TYPES, TASK_TYPE_LABELS } from '~/utils/pipelineCatalog'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Automatizaciones' })
const dt = useDash()
const toast = useToast()
const { confirm } = useConfirm()

const ENTITY_NOUN: Record<string, string> = { lead: 'Lead', visit: 'Visita', offer: 'Oferta', deal: 'Operación', task: 'Tarea' }
const RUN_CLASS: Record<string, string> = { ok: 'bg-emerald-50 text-emerald-700', error: 'bg-red-50 text-red-700', skipped: 'bg-stone-100 text-stone-500' }

const rows = ref<any[]>([])
const summary = ref<any | null>(null)
const agents = ref<{ id: number; name: string }[]>([])
const openRuns = reactive<Record<number, any[] | undefined>>({})
const runningId = ref<number | null>(null)

const real = computed(() => rows.value.filter((r) => !r.legacy))
const legacy = computed(() => rows.value.filter((r) => r.legacy))

async function load() {
  const [list, cat] = await Promise.all([
    $fetch<any>('/api/admin/automations', { params: { perPage: 100 } }).catch(() => null),
    $fetch<any>('/api/admin/automations', { params: { view: 'catalog' } }).catch(() => null),
  ])
  rows.value = list?.rows || []
  summary.value = cat?.summary || null
}

// --- formulario ------------------------------------------------------------------
interface Cond { field: string; op: string; value?: any }
interface FormState { id: number | null; name: string; description: string; trigger: string; action: string; conditions: Cond[]; config: Record<string, any> }
const form = ref<FormState | null>(null)
const formError = ref('')
const saving = ref(false)

const fieldsForTrigger = computed(() => (form.value ? conditionFieldsFor(form.value.trigger) : []))
const fieldDef = (key: string) => CONDITION_FIELDS.find((f) => f.key === key)

function defaultConfig(action: string): Record<string, any> {
  switch (action) {
    case 'create_task':
      return { title: 'Llamar a {{nombre}}', type: 'call', dueInHours: 24, assignee: 'lead_commercial' }
    case 'assign_lead':
      return { commercialId: agents.value[0]?.id }
    case 'change_lead_stage':
      return { stage: 'contacted' }
    case 'create_note':
      return { body: '{{evento}}' }
    default:
      return { message: '{{evento}}: {{nombre}}' }
  }
}

function openForm(a?: any) {
  formError.value = ''
  form.value = a
    ? { id: a.id, name: a.name, description: a.description || '', trigger: a.trigger, action: a.action, conditions: JSON.parse(JSON.stringify(a.conditions || [])), config: { ...a.config } }
    : { id: null, name: '', description: '', trigger: 'lead.created', action: 'create_task', conditions: [], config: defaultConfig('create_task') }
}
watch(
  () => form.value?.action,
  (next, prev) => {
    if (form.value && prev && next && next !== prev) form.value.config = defaultConfig(next)
  },
)

function onFieldChange(c: Cond) {
  const def = fieldDef(c.field)
  c.op = def?.ops[0] || 'eq'
  c.value = c.op === 'in' ? [] : def?.type === 'enum' ? def.options?.[0] : undefined
}
function addCondition() {
  const first = fieldsForTrigger.value[0]
  if (!first || !form.value) return
  const c: Cond = { field: first.key, op: 'eq' }
  onFieldChange(c)
  form.value.conditions.push(c)
}
function describeCondition(c: Cond) {
  const def = fieldDef(c.field)
  const label = def?.label?.toLowerCase() || c.field
  const op = CONDITION_OP_LABELS[c.op as keyof typeof CONDITION_OP_LABELS] || c.op
  if (c.op === 'empty' || c.op === 'not_empty') return `${label} ${op}`
  const val = (v: any) => (def?.type === 'ref' ? agents.value.find((a) => a.id === Number(v))?.name || `#${v}` : def?.optionLabels?.[v] || v)
  return `${label} ${op} ${Array.isArray(c.value) ? c.value.map(val).join(', ') : val(c.value)}`
}

async function save() {
  if (!form.value) return
  saving.value = true
  formError.value = ''
  const f = form.value
  const body = { name: f.name, description: f.description, trigger: f.trigger, action: f.action, conditions: f.conditions, config: f.config }
  try {
    if (f.id) await $fetch(`/api/admin/automations/${f.id}`, { method: 'PUT', body })
    else await $fetch('/api/admin/automations', { method: 'POST', body })
    toast.success('Automatización guardada')
    form.value = null
    await load()
  } catch (e: any) {
    formError.value = e?.data?.statusMessage || 'No se pudo guardar'
  } finally {
    saving.value = false
  }
}

// --- acciones de cada fila ----------------------------------------------------------
async function toggle(a: any) {
  const next = a.enabled ? 0 : 1
  try {
    await $fetch(`/api/admin/automations/${a.id}`, { method: 'PUT', body: { enabled: Boolean(next) } })
    await load()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo cambiar el estado')
  }
}
async function toggleRuns(a: any) {
  if (openRuns[a.id]) {
    openRuns[a.id] = undefined
    return
  }
  const detail = await $fetch<any>(`/api/admin/automations/${a.id}`).catch(() => null)
  openRuns[a.id] = detail?.runs || []
}
async function runNow(a: any) {
  runningId.value = a.id
  try {
    const res = await $fetch<any>(`/api/admin/automations/${a.id}`, { method: 'PUT', body: { action: 'run' } })
    const s = res.summary
    toast.info(s.events ? `${s.events} evento${s.events === 1 ? '' : 's'}: ${s.ok} hecho${s.ok === 1 ? '' : 's'}, ${s.skipped} no aplica${s.skipped === 1 ? '' : 'n'}, ${s.error} con error` : 'No había eventos nuevos')
    await load()
    if (openRuns[a.id]) {
      openRuns[a.id] = undefined
      await toggleRuns(a)
    }
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo procesar')
  } finally {
    runningId.value = null
  }
}
async function remove(a: any) {
  if (!(await confirm(a.legacy ? `«${a.name}» es una demo heredada que nunca se ejecutó.` : `«${a.name}» deja de ejecutarse. Su registro se conserva.`, { title: '¿Eliminar automatización?', confirmLabel: 'Eliminar', danger: true }))) return
  try {
    await $fetch(`/api/admin/automations/${a.id}`, { method: 'DELETE' })
    await load()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo eliminar')
  }
}

onMounted(async () => {
  const res = await $fetch<any>('/api/admin/saas/agents').catch(() => null)
  agents.value = (res?.rows || []).map((r: any) => ({ id: r.id, name: r.name }))
})
await load()
</script>

<style scoped>
.dash-btn-primary {
  @apply inline-flex items-center rounded-lg bg-ink px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-black disabled:opacity-50;
}
.cfg-input {
  @apply w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink;
}
.lbl {
  @apply mb-1 block text-xs font-semibold text-stone-600;
}
</style>
