<!--
  Workflows guiados de INMO (bloque N8b). Cada paso es una Domain Tool del
  mismo motor que usa INMO (RBAC de la sesión, organización, traza) y NUNCA
  se ejecuta sin «Ejecutar paso». Un paso que no se puede preparar con datos
  reales se enseña bloqueado con su motivo; se puede saltar o cancelar.
  API: GET /api/admin/domain-tools?view=workflows | ?view=workflow-run&id=,
  POST /api/admin/domain-tools { mode: 'workflow', action, … }.
-->
<template>
  <section data-testid="inmo-workflows">
    <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Workflows guiados</h2>

    <div v-if="!run" class="space-y-2 rounded-lg border border-line bg-white p-3 text-xs">
      <select v-model="startKey" class="wf-input" data-testid="inmo-workflow-select">
        <option value="">Elige un workflow…</option>
        <option v-for="w in catalog" :key="w.key" :value="w.key">{{ w.label }}</option>
      </select>
      <template v-if="selected">
        <p class="text-stone-500">{{ selected.description }}</p>
        <div v-if="contextChoices.length" class="flex flex-wrap gap-1">
          <button v-for="e in contextChoices" :key="e.id" type="button" class="rounded-full border border-line px-2 py-0.5 hover:border-ink" @click="startEntity = String(e.id)">
            {{ entityNoun }} #{{ e.id }}<template v-if="e.label"> · {{ e.label }}</template>
          </button>
        </div>
        <label class="block">
          <span class="text-stone-500">Id {{ entityNounOf }}</span>
          <input v-model="startEntity" inputmode="numeric" class="wf-input" data-testid="inmo-workflow-entity">
        </label>
        <button type="button" class="w-full rounded-lg bg-ink px-3 py-1.5 font-semibold text-white disabled:opacity-50" :disabled="busy || !startEntity" data-testid="inmo-workflow-start" @click="start">Empezar</button>
      </template>
      <p v-if="error" class="text-red-700" data-testid="inmo-workflow-error">{{ error }}</p>

      <div v-if="recent.length" class="border-t border-line pt-2">
        <p class="mb-1 text-stone-500">Recientes</p>
        <button v-for="r in recent" :key="r.id" type="button" class="block w-full truncate rounded px-1 py-0.5 text-left hover:bg-stone-50" @click="open(r.id)">
          {{ r.label }} · {{ STATUS[r.status] || r.status }}
        </button>
      </div>
    </div>

    <div v-else class="space-y-2 rounded-lg border-2 border-ink bg-white p-3 text-xs" data-testid="inmo-workflow-run">
      <div class="flex items-start justify-between gap-2">
        <p class="font-semibold">{{ run.workflow.label }}</p>
        <button type="button" class="text-stone-400 hover:text-ink" title="Cerrar" @click="close">✕</button>
      </div>
      <p class="text-stone-500">{{ entityLabelOf(run.workflow.entity) }} #{{ run.entity.id }} · {{ STATUS[run.status] || run.status }}</p>
      <ol class="space-y-1">
        <li v-for="(s, i) in run.steps" :key="s.key" class="flex items-start gap-1.5" :data-testid="`inmo-workflow-step-${s.key}`">
          <span class="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full" :class="dot(s.state)" />
          <span :class="s.state === 'current' ? 'font-semibold' : ''">{{ Number(i) + 1 }}. {{ s.label }}</span>
          <span v-if="s.state === 'ok'" class="text-emerald-700">· hecho<template v-if="s.result?.target"> ({{ entityLabelOf(s.result.target.type) }} #{{ s.result.target.id }})</template></span>
          <span v-else-if="s.state === 'skipped'" class="text-stone-400">· saltado</span>
          <span v-else-if="s.lastError" class="text-red-700">· {{ s.lastError.errorCode }}</span>
        </li>
      </ol>

      <div v-if="run.proposal" class="rounded-lg bg-stone-50 p-2" data-testid="inmo-workflow-proposal">
        <p class="font-medium">Paso {{ run.proposal.step + 1 }}: {{ run.proposal.label }}</p>
        <p class="text-stone-500">Herramienta: {{ toolLabel(run.proposal.tool) }}</p>
        <p v-if="run.proposal.blocked" class="mt-1 text-amber-800" data-testid="inmo-workflow-blocked">{{ run.proposal.blocked }}</p>
        <dl v-else-if="run.proposal.input" class="mt-1 grid grid-cols-[auto,1fr] gap-x-2">
          <template v-for="(v, k) in run.proposal.input" :key="k">
            <dt class="text-stone-500">{{ k }}</dt>
            <dd class="break-words font-mono">{{ typeof v === 'object' ? JSON.stringify(v) : v }}</dd>
          </template>
        </dl>
        <template v-if="!run.proposal.blocked">
          <label v-for="p in run.proposal.params" :key="p.key" class="mt-1 block">
            <span class="text-stone-500">{{ p.label }}<template v-if="p.required"> *</template></span>
            <select v-if="p.type === 'match'" v-model="params[p.key]" class="wf-input" :data-testid="`inmo-workflow-param-${p.key}`">
              <option v-for="o in run.proposal.options?.matches || []" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
            <input v-else-if="p.type === 'datetime'" v-model="params[p.key]" type="datetime-local" class="wf-input" :data-testid="`inmo-workflow-param-${p.key}`">
            <textarea v-else v-model="params[p.key]" rows="2" maxlength="1000" class="wf-input" :data-testid="`inmo-workflow-param-${p.key}`" />
          </label>
        </template>
        <p class="mt-1 text-stone-500">No se hace nada hasta que pulses «Ejecutar paso».</p>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <button v-if="!run.proposal.blocked" type="button" class="rounded-lg bg-ink px-3 py-1.5 font-semibold text-white disabled:opacity-50" :disabled="busy" data-testid="inmo-workflow-execute" @click="advance('execute')">Ejecutar paso</button>
          <button type="button" class="rounded-lg border border-line px-3 py-1.5 disabled:opacity-50" :disabled="busy" data-testid="inmo-workflow-skip" @click="advance('skip')">Saltar</button>
          <button type="button" class="rounded-lg border border-line px-3 py-1.5 text-red-700 disabled:opacity-50" :disabled="busy" data-testid="inmo-workflow-cancel" @click="advance('cancel')">Cancelar workflow</button>
        </div>
      </div>
      <p v-if="run.message" class="text-stone-600" data-testid="inmo-workflow-message">{{ run.message }}</p>
      <p v-if="error" class="text-red-700" data-testid="inmo-workflow-error">{{ error }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { inmoEntityLabel, inmoToolLabel } from '~/utils/inmoCatalog'

const props = defineProps<{ entities: { type: string; id: number; label?: string | null }[] }>()
const emit = defineEmits<{ changed: [] }>()

const STATUS: Record<string, string> = { waiting: 'esperando un paso', running: 'ejecutando', ok: 'completado', cancelled: 'cancelado', error: 'error' }
const NOUN: Record<string, string> = { lead: 'Lead', offer: 'Oferta', appointment: 'Cita' }
const toolLabel = inmoToolLabel
const entityLabelOf = (t: string) => NOUN[t] || inmoEntityLabel(t)

const catalog = ref<any[]>([])
const recent = ref<any[]>([])
const run = ref<any | null>(null)
const startKey = ref('')
const startEntity = ref('')
const params = ref<Record<string, string>>({})
const busy = ref(false)
const error = ref('')

const selected = computed(() => catalog.value.find((w) => w.key === startKey.value) || null)
const entityNoun = computed(() => NOUN[selected.value?.entity] || '')
const entityNounOf = computed(() => ({ lead: 'del lead', offer: 'de la oferta', appointment: 'de la cita' })[selected.value?.entity as string] || '')
const contextChoices = computed(() => props.entities.filter((e) => e.type === selected.value?.entity).slice(-4))

async function load() {
  const res = await $fetch<any>('/api/admin/domain-tools', { params: { view: 'workflows' } }).catch(() => null)
  catalog.value = res?.workflows || []
  recent.value = res?.runs || []
}

function errorOf(e: any) {
  return e?.data?.statusMessage || e?.statusMessage || 'No se pudo completar el paso.'
}

async function start() {
  busy.value = true
  error.value = ''
  try {
    run.value = await $fetch<any>('/api/admin/domain-tools', { method: 'POST', body: { mode: 'workflow', action: 'start', workflow: startKey.value, entityId: Number(startEntity.value) } })
    resetParams()
  } catch (e: any) {
    error.value = errorOf(e)
  } finally {
    busy.value = false
  }
}

async function open(id: number) {
  error.value = ''
  run.value = await $fetch<any>('/api/admin/domain-tools', { params: { view: 'workflow-run', id } }).catch(() => null)
  resetParams()
}

function resetParams() {
  const first = run.value?.proposal?.options?.matches?.[0]?.value
  params.value = first ? { match: first } : {}
}

async function advance(action: 'execute' | 'skip' | 'cancel') {
  if (!run.value?.proposal) return
  busy.value = true
  error.value = ''
  try {
    const body: Record<string, unknown> = { mode: 'workflow', runId: run.value.id, action, step: run.value.proposal.step, params: { ...params.value } }
    run.value = await $fetch<any>('/api/admin/domain-tools', { method: 'POST', body })
    resetParams()
    emit('changed')
  } catch (e: any) {
    error.value = errorOf(e)
  } finally {
    busy.value = false
  }
}

function close() {
  run.value = null
  error.value = ''
  load()
}

function dot(state: string) {
  return { ok: 'bg-emerald-500', skipped: 'bg-stone-300', current: 'bg-ink', pending: 'bg-stone-200' }[state] || 'bg-stone-200'
}

onMounted(load)
</script>

<style scoped>
.wf-input {
  @apply mt-0.5 w-full rounded-md border border-line bg-white px-2 py-1 text-xs focus:border-ink;
}
</style>
