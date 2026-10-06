<template>
  <div data-testid="routing-rule-editor">
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold">{{ isNew ? 'Nueva regla de enrutado' : `Regla de enrutado #${id}` }}</h1>
      <div class="flex flex-wrap gap-2">
        <NuxtLink to="/admin/enrutamiento" class="btn-secondary">Enrutamiento y SLA</NuxtLink>
        <NuxtLink to="/admin/lead-routing-rules" class="btn-secondary">← Volver</NuxtLink>
      </div>
    </div>

    <form class="card max-w-3xl space-y-5 p-4 sm:p-6" @submit.prevent="save">
      <fieldset :disabled="!canEdit" class="space-y-5">
        <div class="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <label class="block">
            <span class="label">Nombre <span class="text-red-500">*</span></span>
            <input v-model="form.name" class="input" required data-testid="routing-rule-name" >
          </label>
          <label class="block">
            <span class="label">Prioridad</span>
            <input v-model.number="form.priority" type="number" class="input" data-testid="routing-rule-priority" >
            <span class="mt-1 block text-[11px] text-slate-400">Menor = se prueba antes</span>
          </label>
        </div>

        <!-- Ámbito: a qué leads aplica -->
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="block">
            <span class="label">Ámbito <span class="text-red-500">*</span></span>
            <select v-model="form.scope" class="input" data-testid="routing-rule-scope" @change="form.matchValue = ''">
              <option v-for="s in ROUTING_SCOPES" :key="s" :value="s">{{ ROUTING_SCOPE_LABELS[s] }}</option>
            </select>
          </label>

          <!-- Valor a comparar, según el ámbito: nunca un id tecleado. -->
          <label v-if="form.scope === 'office'" class="block">
            <span class="label">Oficina del lead</span>
            <select v-model="form.matchValue" class="input" data-testid="routing-rule-match-office">
              <option value="">Cualquier oficina</option>
              <option v-if="form.matchValue && !offices.some((o) => String(o.id) === form.matchValue)" :value="form.matchValue">Oficina #{{ form.matchValue }}</option>
              <option v-for="o in offices" :key="o.id" :value="String(o.id)">{{ o.label }}</option>
            </select>
          </label>
          <label v-else-if="form.scope === 'team'" class="block">
            <span class="label">Equipo que reparte <span class="text-red-500">*</span></span>
            <select v-model="form.matchValue" class="input" required data-testid="routing-rule-match-team">
              <option value="">Elige un equipo…</option>
              <option v-if="form.matchValue && !teams.some((o) => String(o.id) === form.matchValue)" :value="form.matchValue">Equipo #{{ form.matchValue }}</option>
              <option v-for="o in teams" :key="o.id" :value="String(o.id)">{{ o.label }}</option>
            </select>
          </label>
          <label v-else-if="form.scope === 'language'" class="block">
            <span class="label">Idioma del lead <span class="text-red-500">*</span></span>
            <select v-model="form.matchValue" class="input" required data-testid="routing-rule-match-language">
              <option value="">Elige un idioma…</option>
              <option v-for="l in LANGUAGE_OPTIONS" :key="l" :value="l">{{ LANGUAGE_LABELS[l] }}</option>
            </select>
          </label>
          <label v-else-if="form.scope === 'property_type'" class="block">
            <span class="label">Tipo de inmueble</span>
            <select v-model="form.matchValue" class="input" data-testid="routing-rule-match-type">
              <option value="">Elige un tipo…</option>
              <option v-if="form.matchValue && !(PROPERTY_TYPES as readonly string[]).includes(form.matchValue)" :value="form.matchValue">{{ form.matchValue }}</option>
              <option v-for="t in PROPERTY_TYPES" :key="t" :value="t">{{ PROPERTY_TYPE_LABELS[t] || t }}</option>
            </select>
          </label>
          <label v-else-if="form.scope === 'zone'" class="block">
            <span class="label">Zona (distrito o localidad)</span>
            <input v-model="form.matchValue" class="input" placeholder="Chamberí, Marbella…" data-testid="routing-rule-match-zone" >
          </label>
          <p v-else class="self-end text-[12px] text-slate-500">{{ SCOPE_HINTS[form.scope] }}</p>
        </div>

        <!-- Destino: a quién va -->
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="block">
            <span class="label">Comercial fijo (opcional)</span>
            <select v-model="form.targetCommercialId" class="input" data-testid="routing-rule-commercial">
              <option value="">— Repartir en un grupo —</option>
              <option v-for="o in commercials" :key="o.id" :value="String(o.id)">{{ o.label }}</option>
            </select>
          </label>
          <label class="block">
            <span class="label">Repartir dentro de la oficina</span>
            <select v-model="form.targetOfficeId" class="input" data-testid="routing-rule-target-office">
              <option value="">Cualquier oficina</option>
              <option v-for="o in offices" :key="o.id" :value="String(o.id)">{{ o.label }}</option>
            </select>
          </label>
          <label class="block">
            <span class="label">Departamento (opcional)</span>
            <input v-model="form.targetDepartment" class="input" placeholder="Como en la ficha del comercial" data-testid="routing-rule-department" >
          </label>
          <label class="block">
            <span class="label">Reparto</span>
            <select v-model="form.strategy" class="input" data-testid="routing-rule-strategy">
              <option value="round_robin">Por turnos (round robin)</option>
              <option value="workload">Por carga de trabajo</option>
            </select>
          </label>
        </div>

        <!-- Horario: genera el mismo JSON que lee server/utils/leads/routing.ts -->
        <section class="rounded-lg border border-slate-200 p-3 sm:p-4" data-testid="routing-rule-schedule">
          <label class="flex items-center gap-2 text-sm font-medium">
            <input v-model="schedule.enabled" type="checkbox" data-testid="routing-rule-schedule-toggle" >
            Sólo en un horario
          </label>
          <p class="mt-1 text-[12px] text-slate-500">Fuera de este horario la regla no aplica y se prueba la siguiente (p. ej. un equipo de guardia por la noche o el fin de semana).</p>
          <div v-if="schedule.enabled" class="mt-3 space-y-3">
            <div class="flex flex-wrap gap-1.5">
              <button v-for="p in SCHEDULE_PRESETS" :key="p.label" type="button" class="rounded-full border border-slate-200 px-2.5 py-1 text-[12px] text-slate-600 hover:bg-slate-50" :data-testid="`routing-rule-preset-${p.key}`" @click="applyPreset(p)">
                {{ p.label }}
              </button>
            </div>
            <div>
              <p class="label">Días</p>
              <div class="flex flex-wrap gap-1.5" role="group" aria-label="Días de la semana">
                <button
                  v-for="d in DAYS"
                  :key="d.n"
                  type="button"
                  class="h-9 w-11 rounded-lg border text-[13px] font-medium transition"
                  :class="schedule.days.includes(d.n) ? 'border-ink bg-ink text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'"
                  :aria-pressed="schedule.days.includes(d.n)"
                  :title="d.long"
                  :data-testid="`routing-rule-day-${d.n}`"
                  @click="toggleDay(d.n)"
                >
                  {{ d.short }}
                </button>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label class="block">
                <span class="label">Desde</span>
                <input v-model="schedule.from" type="time" class="input" data-testid="routing-rule-from" >
              </label>
              <label class="block">
                <span class="label">Hasta</span>
                <input v-model="schedule.to" type="time" class="input" data-testid="routing-rule-to" >
              </label>
              <label class="col-span-2 block sm:col-span-1">
                <span class="label">Zona horaria</span>
                <select v-model="schedule.timezone" class="input" data-testid="routing-rule-timezone">
                  <option v-for="tz in timezones" :key="tz" :value="tz">{{ tz }}</option>
                </select>
              </label>
            </div>
            <p class="text-[12px] text-slate-600" data-testid="routing-rule-schedule-summary">{{ scheduleSummary }}</p>
            <details class="text-[11px] text-slate-400">
              <summary class="cursor-pointer">JSON que se guarda</summary>
              <code class="mt-1 block break-all" data-testid="routing-rule-schedule-json">{{ JSON.stringify(scheduleJson) }}</code>
            </details>
          </div>
        </section>

        <label class="flex items-center gap-2 text-sm">
          <input v-model="form.enabled" type="checkbox" data-testid="routing-rule-enabled" >
          Regla activa
        </label>
      </fieldset>

      <div v-if="canEdit" class="flex flex-wrap items-center gap-3">
        <button type="submit" class="btn-primary" :disabled="saving || !form.name.trim()" data-testid="routing-rule-save">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
        <p v-if="saved" class="text-sm font-medium text-emerald-700" data-testid="routing-rule-saved">Guardado ✓</p>
        <p v-if="error" class="text-sm font-medium text-red-600" data-testid="routing-rule-error">{{ error }}</p>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ROUTING_SCOPES, ROUTING_SCOPE_LABELS } from '~/utils/leadCatalog'
import { LANGUAGE_LABELS, LANGUAGE_OPTIONS } from '~/utils/crmCatalog'
import { PROPERTY_TYPES, PROPERTY_TYPE_LABELS } from '~/utils/propertySheet'
import { invalidateRelationOptions, loadRelationOptions, type RelationOption } from '~/composables/useRelationOptions'

/**
 * Editor de una regla de enrutado de leads (cierre del núcleo, FASE 15).
 * Sustituye al formulario genérico de `lead-routing-rules`, donde la oficina
 * y el equipo se escribían como un id en texto y el horario como JSON a
 * mano: aquí son desplegables con las oficinas, equipos y comerciales de la
 * agencia, y un editor de días + franja que genera exactamente el JSON que
 * ya lee server/utils/leads/routing.ts (`{ days, from, to, timezone }`).
 * Guarda por el mismo CRUD genérico (POST/PUT /api/admin/lead-routing-rules),
 * que vuelve a validar todo con `validateRoutingRule()`.
 */
const props = defineProps<{ id: string; canEdit: boolean }>()
const router = useRouter()
const isNew = computed(() => props.id === 'new')

const SCOPE_HINTS: Record<string, string> = {
  property: 'Asigna el lead al comercial responsable de su propiedad de interés (en el catálogo de esa propiedad).',
  new_build: 'Aplica a los leads cuya propiedad de interés es de obra nueva.',
  department: 'Sin condición: reparte todos los leads que lleguen hasta aquí (típicamente la última regla).',
}
const DAYS = [
  { n: 1, short: 'L', long: 'Lunes' },
  { n: 2, short: 'M', long: 'Martes' },
  { n: 3, short: 'X', long: 'Miércoles' },
  { n: 4, short: 'J', long: 'Jueves' },
  { n: 5, short: 'V', long: 'Viernes' },
  { n: 6, short: 'S', long: 'Sábado' },
  { n: 7, short: 'D', long: 'Domingo' },
]
const SCHEDULE_PRESETS = [
  { key: 'office', label: 'Laborables 9:00-18:00', days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' },
  { key: 'weekend', label: 'Fines de semana', days: [6, 7], from: '00:00', to: '23:59' },
  { key: 'night', label: 'Noches 22:00-06:00', days: [1, 2, 3, 4, 5, 6, 7], from: '22:00', to: '06:00' },
]
const DEFAULT_TZ = 'Europe/Madrid'
const BASE_TIMEZONES = ['Europe/Madrid', 'Atlantic/Canary', 'Europe/Lisbon', 'Europe/London', 'Europe/Paris', 'Asia/Dubai', 'UTC']

const form = reactive({
  name: '',
  priority: 100 as number | string,
  scope: 'zone' as string,
  matchValue: '',
  targetCommercialId: '',
  targetOfficeId: '',
  targetDepartment: '',
  strategy: 'round_robin',
  enabled: true,
})
const schedule = reactive({ enabled: false, days: [1, 2, 3, 4, 5] as number[], from: '09:00', to: '18:00', timezone: DEFAULT_TZ })
const timezones = computed(() => (BASE_TIMEZONES.includes(schedule.timezone) ? BASE_TIMEZONES : [schedule.timezone, ...BASE_TIMEZONES]))

if (!isNew.value) {
  // Mismo motivo que la ficha genérica: en SSR, la petición tiene que heredar la sesión.
  const res = await useRequestFetch()<any>(`/api/admin/lead-routing-rules/${props.id}`)
  const r = res.row || {}
  Object.assign(form, {
    name: r.name || '',
    priority: r.priority ?? 100,
    scope: r.scope || 'zone',
    matchValue: r.matchValue == null ? '' : String(r.matchValue),
    targetCommercialId: r.targetCommercialId ? String(r.targetCommercialId) : '',
    targetOfficeId: r.targetOfficeId ? String(r.targetOfficeId) : '',
    targetDepartment: r.targetDepartment || '',
    strategy: r.strategy || 'round_robin',
    enabled: Number(r.enabled ?? 1) === 1,
  })
  const s = parseSchedule(r.scheduleJson)
  if (s) Object.assign(schedule, { enabled: true, days: Array.isArray(s.days) && s.days.length ? s.days.map(Number) : [1, 2, 3, 4, 5, 6, 7], from: s.from || '00:00', to: s.to || '23:59', timezone: s.timezone || DEFAULT_TZ })
}

function parseSchedule(raw: unknown): { days?: number[]; from?: string; to?: string; timezone?: string } | null {
  if (!raw) return null
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw
    return v && typeof v === 'object' ? (v as any) : null
  } catch {
    return null
  }
}

const offices = ref<RelationOption[]>([])
const teams = ref<RelationOption[]>([])
const commercials = ref<RelationOption[]>([])
onMounted(() => {
  loadRelationOptions('offices').then((r) => (offices.value = r))
  loadRelationOptions('teams').then((r) => (teams.value = r))
  loadRelationOptions('team').then((r) => (commercials.value = r))
})

function toggleDay(n: number) {
  schedule.days = schedule.days.includes(n) ? schedule.days.filter((d) => d !== n) : [...schedule.days, n].sort((a, b) => a - b)
}
function applyPreset(p: (typeof SCHEDULE_PRESETS)[number]) {
  Object.assign(schedule, { days: [...p.days], from: p.from, to: p.to })
}

/** Exactamente lo que consume `parseRoutingSchedule()` / `isWithinSchedule()` en el servidor. */
const scheduleJson = computed(() => ({ days: [...schedule.days].sort((a, b) => a - b), from: schedule.from || '00:00', to: schedule.to || '23:59', timezone: schedule.timezone || DEFAULT_TZ }))
const scheduleSummary = computed(() => {
  const s = scheduleJson.value
  if (!s.days.length) return 'Elige al menos un día.'
  const days = s.days.length === 7 ? 'Todos los días' : s.days.map((n) => DAYS.find((d) => d.n === n)?.long).join(', ')
  const overnight = s.from > s.to ? ' (cruza la medianoche: hasta el día siguiente)' : ''
  return `${days}, de ${s.from} a ${s.to}${overnight} · ${s.timezone}`
})

const saving = ref(false)
const saved = ref(false)
const error = ref('')

async function save() {
  error.value = ''
  saved.value = false
  if (schedule.enabled && !schedule.days.length) {
    error.value = 'Elige al menos un día del horario, o desactívalo.'
    return
  }
  saving.value = true
  const body = {
    name: form.name.trim(),
    priority: form.priority === '' ? 100 : Number(form.priority),
    scope: form.scope,
    // Sólo los ámbitos que comparan algo guardan valor; el resto, vacío.
    matchValue: ['zone', 'office', 'language', 'property_type', 'team'].includes(form.scope) ? form.matchValue.trim() || null : null,
    targetCommercialId: form.targetCommercialId ? Number(form.targetCommercialId) : null,
    targetOfficeId: form.targetOfficeId ? Number(form.targetOfficeId) : null,
    targetDepartment: form.targetDepartment.trim() || null,
    strategy: form.strategy,
    scheduleJson: schedule.enabled ? scheduleJson.value : null,
    enabled: form.enabled ? 1 : 0,
  }
  try {
    if (isNew.value) {
      const res = await $fetch<{ id: number }>('/api/admin/lead-routing-rules', { method: 'POST', body })
      invalidateRelationOptions('lead-routing-rules')
      await router.replace(`/admin/lead-routing-rules/${res.id}`)
    } else {
      await $fetch(`/api/admin/lead-routing-rules/${props.id}`, { method: 'PUT', body })
    }
    saved.value = true
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || 'No se ha podido guardar la regla'
  } finally {
    saving.value = false
  }
}
</script>
