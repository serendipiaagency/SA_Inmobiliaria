<!--
  Asignación y plazos — Fases 15 y 16.

  Reúne tres cosas que van juntas: a quién le toca cada lead, qué leads se han
  quedado sin dueño, y quién se ha salido de plazo.
-->
<template>
  <div>
    <header class="mb-6">
      <h1 class="text-xl font-semibold">Asignación y plazos</h1>
      <p class="mt-1 text-sm text-stone-500">
        Quién atiende cada lead, por qué le tocó, y qué se está saliendo de plazo.
      </p>
    </header>

    <!-- ALERTAS -->
    <AdminPanel title="Alertas de atención" class="mb-5">
      <template v-if="!sla?.config?.enabled">
        <p class="text-sm text-stone-500">
          El seguimiento de plazos está desactivado, así que no se genera ninguna alerta.
        </p>
      </template>
      <template v-else>
        <p v-if="!alerts.length" class="text-sm text-emerald-700">Ningún lead fuera de plazo ahora mismo.</p>
        <ul v-else class="divide-y divide-line text-sm" data-testid="sla-alerts">
          <li v-for="a in alerts" :key="a.id" class="flex items-start justify-between gap-4 py-3">
            <div class="min-w-0">
              <p class="font-medium">{{ a.lead?.name || `Lead #${a.leadId}` }}</p>
              <p class="text-xs text-stone-500">
                <span class="font-medium text-amber-700">{{ a.kindLabel }}</span> · {{ a.detail }}
                <span v-if="a.lead?.agentName"> · {{ a.lead.agentName }}</span>
              </p>
            </div>
            <button type="button" class="shrink-0 text-xs font-medium text-stone-500 hover:text-ink hover:underline" @click="dismiss(a)">
              Descartar
            </button>
          </li>
        </ul>
      </template>
    </AdminPanel>

    <!-- SIN ASIGNAR -->
    <AdminPanel title="Leads sin dueño" class="mb-5">
      <p v-if="!unassigned.length" class="text-sm text-emerald-700">Todos los leads vivos tienen comercial asignado.</p>
      <template v-else>
        <p class="mb-3 text-sm text-stone-500">
          Estos leads entraron pero ninguna regla encontró a quién asignarlos. Nadie los está atendiendo.
        </p>
        <ul class="divide-y divide-line text-sm" data-testid="unassigned-leads">
          <li v-for="l in unassigned" :key="l.id" class="flex items-center justify-between gap-4 py-2.5">
            <div>
              <p class="font-medium">{{ l.name }}</p>
              <p class="text-xs text-stone-400">{{ l.source }} · {{ dt.date(l.createdAt) }}</p>
            </div>
            <button type="button" class="rounded-lg border border-line px-2.5 py-1 text-xs font-medium hover:bg-stone-50" @click="assign(l.id)">
              Asignar ahora
            </button>
          </li>
        </ul>
      </template>
    </AdminPanel>

    <!-- PLAZOS -->
    <AdminPanel title="Plazos de atención" class="mb-5">
      <div class="grid gap-4 sm:grid-cols-3">
        <label class="flex items-center gap-2 text-sm">
          <input v-model="form.enabled" type="checkbox" >
          Medir y alertar
        </label>
        <div>
          <label class="cfg-label" for="sla-min">Responder antes de (minutos)</label>
          <input id="sla-min" v-model.number="form.firstResponseMinutes" type="number" min="1" class="cfg-input" >
        </div>
        <div>
          <label class="cfg-label" for="sla-stale">Avisar sin contacto tras (días)</label>
          <input id="sla-stale" v-model.number="form.staleDays" type="number" min="1" class="cfg-input" >
        </div>
      </div>
      <button type="button" class="dash-btn-primary mt-4" :disabled="saving" @click="saveSettings">
        {{ saving ? 'Guardando…' : 'Guardar plazos' }}
      </button>

      <div v-if="sla?.metrics" class="mt-5 border-t border-line pt-4 text-sm">
        <p v-if="sla.metrics.medianResponseMinutes == null" class="text-stone-500">
          Todavía no hay ningún lead con respuesta registrada, así que no hay nada que medir.
        </p>
        <template v-else>
          <p>
            Mediana de respuesta: <strong>{{ sla.metrics.medianResponseMinutes }} min</strong> ·
            dentro de plazo {{ sla.metrics.withinTarget }} · fuera {{ sla.metrics.breached }}
          </p>
          <!-- Decir sobre cuántos se midió evita que una mediana calculada con
               tres leads de sesenta parezca representativa. -->
          <p class="mt-1 text-xs text-stone-400">
            Medido sobre {{ sla.metrics.measured }} de {{ sla.metrics.total }} leads; del resto no consta cuándo se respondió.
          </p>
        </template>
      </div>
    </AdminPanel>

    <!-- REGLAS -->
    <AdminPanel title="Reglas de asignación">
      <p class="mb-3 text-sm text-stone-500">
        Se evalúan de arriba abajo. La primera que encaja y encuentra a alguien libre gana.
        Si ninguna lo consigue, el lead se reparte por turno entre los comerciales activos.
      </p>

      <p v-if="!rules.length" class="rounded-xl border border-dashed border-line px-6 py-8 text-center text-sm text-stone-500">
        Sin reglas: ahora mismo todos los leads se reparten por turno rotatorio.
      </p>
      <ul v-else class="divide-y divide-line text-sm" data-testid="routing-rules">
        <li v-for="r in rules" :key="r.id" class="flex items-start justify-between gap-4 py-3">
          <div class="min-w-0">
            <p class="font-medium">
              {{ r.name }}
              <span v-if="!r.enabled" class="ml-1 text-xs font-normal text-stone-400">(desactivada)</span>
            </p>
            <p class="text-xs text-stone-500">
              Prioridad {{ r.priority }} · {{ strategyLabel(r.strategy) }}
              <span v-if="r.targetOffice"> · oficina {{ r.targetOffice }}</span>
            </p>
            <p v-if="conditionsOf(r)" class="text-xs text-stone-400">Si: {{ conditionsOf(r) }}</p>
          </div>
          <button type="button" class="shrink-0 text-xs font-medium text-stone-500 hover:text-ink hover:underline" @click="edit(r)">
            Editar
          </button>
        </li>
      </ul>

      <div class="mt-4 border-t border-line pt-4">
        <p class="mb-3 text-sm font-medium">{{ form.rule.id ? 'Editar regla' : 'Nueva regla' }}</p>
        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label class="cfg-label" for="r-name">Nombre</label>
            <input id="r-name" v-model="form.rule.name" class="cfg-input" placeholder="Idealista → oficina Centro" >
          </div>
          <div>
            <label class="cfg-label" for="r-priority">Prioridad (menor = antes)</label>
            <input id="r-priority" v-model.number="form.rule.priority" type="number" class="cfg-input" >
          </div>
          <div>
            <label class="cfg-label" for="r-portal">Sólo si el portal es</label>
            <input id="r-portal" v-model="form.rule.matchPortal" class="cfg-input" placeholder="(cualquiera)" >
          </div>
          <div>
            <label class="cfg-label" for="r-zone">Sólo si la zona es</label>
            <input id="r-zone" v-model="form.rule.matchZone" class="cfg-input" placeholder="(cualquiera)" >
          </div>
          <div>
            <label class="cfg-label" for="r-strategy">Cómo elige</label>
            <select id="r-strategy" v-model="form.rule.strategy" class="cfg-input">
              <option v-for="s in strategies" :key="s.key" :value="s.key">{{ s.label }}</option>
            </select>
          </div>
          <div v-if="form.rule.strategy === 'specific'">
            <label class="cfg-label" for="r-target">Comercial</label>
            <select id="r-target" v-model.number="form.rule.targetCommercialId" class="cfg-input">
              <option :value="null">Selecciona…</option>
              <option v-for="c in commercials" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </div>
          <div v-else>
            <label class="cfg-label" for="r-office">Limitar a la oficina</label>
            <input id="r-office" v-model="form.rule.targetOffice" class="cfg-input" placeholder="(todas)" >
          </div>
        </div>
        <p v-if="ruleError" class="mt-2 text-sm text-rose-600">{{ ruleError }}</p>
        <div class="mt-3 flex gap-2">
          <button type="button" class="dash-btn-primary" :disabled="savingRule" @click="saveRule">
            {{ savingRule ? 'Guardando…' : 'Guardar regla' }}
          </button>
          <button v-if="form.rule.id" type="button" class="rounded-lg border border-line px-3 py-2 text-sm hover:bg-stone-50" @click="resetRule">
            Cancelar
          </button>
        </div>
      </div>
    </AdminPanel>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Asignación y plazos — M&M Real Estate' })

const dt = useDash()
const toast = useToast()

const { data: routing, refresh: refreshRouting } = await useFetch<any>('/api/admin/saas/routing/rules')
const { data: sla, refresh: refreshSla } = await useFetch<any>('/api/admin/saas/sla/settings')
const { data: alertsData, refresh: refreshAlerts } = await useFetch<any>('/api/admin/saas/sla/alerts')
const { data: unassignedData, refresh: refreshUnassigned } = await useFetch<any>('/api/admin/saas/routing/unassigned')

const rules = computed<any[]>(() => routing.value?.rules || [])
const commercials = computed<any[]>(() => routing.value?.commercials || [])
const strategies = computed<any[]>(() => routing.value?.strategies || [])
const alerts = computed<any[]>(() => alertsData.value?.alerts || [])
const unassigned = computed<any[]>(() => unassignedData.value || [])

const emptyRule = () => ({
  id: null as number | null,
  name: '',
  priority: 100,
  matchPortal: '',
  matchZone: '',
  strategy: 'round_robin',
  targetCommercialId: null as number | null,
  targetOffice: '',
})

const form = reactive({
  enabled: false,
  firstResponseMinutes: 60,
  staleDays: 7,
  rule: emptyRule(),
})

watch(
  sla,
  (v) => {
    if (!v?.config) return
    form.enabled = !!v.config.enabled
    form.firstResponseMinutes = v.config.firstResponseMinutes
    form.staleDays = v.config.staleDays
  },
  { immediate: true },
)

const saving = ref(false)
const savingRule = ref(false)
const ruleError = ref('')

function strategyLabel(key: string) {
  return strategies.value.find((s) => s.key === key)?.label || key
}

function conditionsOf(r: any) {
  return [
    r.matchSource ? `origen ${r.matchSource}` : null,
    r.matchPortal ? `portal ${r.matchPortal}` : null,
    r.matchZone ? `zona ${r.matchZone}` : null,
    r.matchPropertyType ? `tipo ${r.matchPropertyType}` : null,
    r.matchLanguage ? `idioma ${r.matchLanguage}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

function edit(r: any) {
  form.rule = {
    id: r.id,
    name: r.name,
    priority: r.priority,
    matchPortal: r.matchPortal || '',
    matchZone: r.matchZone || '',
    strategy: r.strategy,
    targetCommercialId: r.targetCommercialId,
    targetOffice: r.targetOffice || '',
  }
}

function resetRule() {
  form.rule = emptyRule()
  ruleError.value = ''
}

async function saveRule() {
  savingRule.value = true
  ruleError.value = ''
  try {
    await $fetch('/api/admin/saas/routing/rules', { method: 'POST', body: { ...form.rule } })
    resetRule()
    await refreshRouting()
    toast.success('Regla guardada')
  } catch (err: any) {
    ruleError.value = err?.data?.statusMessage || 'No se pudo guardar'
  } finally {
    savingRule.value = false
  }
}

async function saveSettings() {
  saving.value = true
  try {
    await $fetch('/api/admin/saas/sla/settings', {
      method: 'POST',
      body: { enabled: form.enabled, firstResponseMinutes: form.firstResponseMinutes, staleDays: form.staleDays },
    })
    await Promise.all([refreshSla(), refreshAlerts()])
    toast.success('Plazos guardados')
  } catch {
    toast.error('No se pudo guardar')
  } finally {
    saving.value = false
  }
}

async function assign(leadId: number) {
  try {
    const result = await $fetch<any>('/api/admin/saas/routing/assign', { method: 'POST', body: { leadId } })
    await refreshUnassigned()
    // Se enseña la explicación que produjo el motor, no una frase inventada aquí.
    toast.success(result.decision.explanation)
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || 'No se pudo asignar')
  }
}

async function dismiss(alert: any) {
  const reason = window.prompt('Motivo para descartar el aviso (opcional)') || undefined
  try {
    await $fetch('/api/admin/saas/sla/alerts', { method: 'POST', body: { alertId: alert.id, reason } })
    await refreshAlerts()
  } catch {
    toast.error('No se pudo descartar')
  }
}
</script>

<style scoped>
.cfg-label {
  @apply mb-1.5 block text-[12px] font-medium text-stone-600;
}
.cfg-input {
  @apply w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink;
}
.dash-btn-primary {
  @apply inline-flex items-center rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white transition hover:bg-black disabled:opacity-50;
}
</style>
