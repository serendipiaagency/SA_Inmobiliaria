<!--
  Enrutamiento y SLA de leads (FASE 15 — Lead Routing; FASE 16 — Lead SLA;
  FASE 32 — reglas del Lead Score explicable).

  Las reglas de enrutado (quién decide a qué comercial va un lead nuevo) se
  gestionan en /admin/lead-routing-rules, con su propio editor
  (components/admin/leads/RoutingRuleEditor.vue: desplegables de oficinas,
  equipos e idiomas y editor de horario) — esta página se centra en lo que
  sí es propio: los umbrales de SLA por agencia y las alertas abiertas ahora
  mismo, con acción directa sobre cada una.
-->
<template>
  <div>
    <header class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold">Enrutamiento y SLA</h1>
        <p class="mt-1 text-sm text-stone-500">Quién atiende cada lead, y si se está atendiendo a tiempo.</p>
      </div>
      <NuxtLink to="/admin/lead-routing-rules" class="rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-stone-50">
        Gestionar reglas de enrutado →
      </NuxtLink>
    </header>

    <AdminPanel title="Umbrales de SLA" class="mb-6">
      <p class="mb-4 text-xs text-stone-500">
        Por agencia — nunca una regla universal. Un lead cruza cada umbral en tiempo natural (no horario comercial) desde el momento correspondiente.
      </p>
      <div v-if="settings" class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label class="text-sm">
          <span class="mb-1 block text-stone-600">Nuevo sin atender (minutos)</span>
          <input v-model.number="settings.newLeadUnattendedMinutes" type="number" min="1" class="cfg-input" data-testid="sla-unattended-minutes">
        </label>
        <label class="text-sm">
          <span class="mb-1 block text-stone-600">Cualificado sin próxima acción (horas)</span>
          <input v-model.number="settings.qualifiedWithoutActionHours" type="number" min="1" class="cfg-input" data-testid="sla-qualified-hours">
        </label>
        <label class="text-sm">
          <span class="mb-1 block text-stone-600">Sin contacto (días)</span>
          <input v-model.number="settings.inactiveLeadDays" type="number" min="1" class="cfg-input" data-testid="sla-inactive-days">
        </label>
      </div>
      <button type="button" class="mt-4 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90" :disabled="savingSettings" data-testid="sla-settings-save" @click="saveSettings">
        {{ savingSettings ? 'Guardando…' : 'Guardar umbrales' }}
      </button>
    </AdminPanel>

    <!-- FASE 32 — Lead Score explicable: reglas de esta agencia -->
    <AdminPanel title="Lead Score" class="mb-6" data-testid="lead-score-rules">
      <p class="mb-4 text-xs text-stone-500">
        Puntuación de 0 a 100 por reglas deterministas sobre señales reales — cada lead muestra «por qué» tiene su número. No es la compatibilidad con un inmueble (eso es el Matching), no cambia el enrutado y no sustituye al SLA. Guardar no recalcula nada por sí solo: usa «Recalcular todos».
      </p>
      <div v-if="scoreSettings" class="space-y-2">
        <div v-for="r in scoreSettings.rules" :key="r.criterion" class="grid grid-cols-1 items-start gap-2 rounded-lg border border-line px-3 py-2.5 sm:grid-cols-[1fr_auto_auto]" :data-testid="`lead-score-rule-${r.criterion}`">
          <div class="min-w-0">
            <label class="flex items-center gap-2 text-sm font-medium">
              <input v-model="r.enabled" type="checkbox">
              {{ r.label }}
            </label>
            <p class="mt-0.5 text-[11px] text-stone-400">{{ r.source }}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-xs text-stone-600">
            <label v-if="r.criterion === 'purchase_horizon'" class="flex items-center gap-1">en <input v-model.number="r.config.withinDays" type="number" min="1" max="365" class="cfg-input !w-20"> días</label>
            <label v-else-if="r.criterion === 'responded_recently'" class="flex items-center gap-1">en <input v-model.number="r.config.withinHours" type="number" min="1" max="168" class="cfg-input !w-20"> horas</label>
            <label v-else-if="r.criterion === 'opened_listings'" class="flex items-center gap-1">mínimo <input v-model.number="r.config.min" type="number" min="1" max="50" class="cfg-input !w-20"> fichas</label>
            <label v-else-if="r.criterion === 'no_response'" class="flex items-center gap-1">tras <input v-model.number="r.config.days" type="number" min="1" max="365" class="cfg-input !w-20"> días</label>
            <span v-else-if="r.criterion === 'financing_validated'" class="flex flex-wrap gap-2">
              <label v-for="st in scoreSettings.financingStatuses" :key="st" class="flex items-center gap-1">
                <input type="checkbox" :checked="r.config.statuses?.includes(st)" @change="toggleStatus(r, st)"> {{ FINANCING_LABELS[st] || st }}
              </label>
            </span>
          </div>
          <label class="flex items-center gap-1 text-xs text-stone-600">
            <input v-model.number="r.points" type="number" min="-100" max="100" class="cfg-input !w-20" :data-testid="`lead-score-points-${r.criterion}`"> puntos
          </label>
        </div>
      </div>
      <div class="mt-4 flex flex-wrap gap-2">
        <button type="button" class="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90" :disabled="savingScore" data-testid="lead-score-save" @click="saveScoreRules">
          {{ savingScore ? 'Guardando…' : 'Guardar reglas' }}
        </button>
        <button type="button" class="rounded-lg border border-line px-4 py-2 text-sm font-medium hover:bg-stone-50" :disabled="recalculating" data-testid="lead-score-recalculate-all" @click="recalculateAll">
          {{ recalculating ? recalcLabel : 'Recalcular todos los leads' }}
        </button>
      </div>
    </AdminPanel>

    <AdminPanel title="Alertas abiertas">
      <p v-if="loadingAlerts" class="text-sm text-stone-400">Cargando…</p>
      <p v-else-if="!alerts.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">
        Sin alertas abiertas — todo al día.
      </p>
      <div v-else class="space-y-2">
        <div v-for="a in alerts" :key="a.id" class="flex items-center justify-between rounded-lg border border-line px-4 py-2.5 text-sm" :data-testid="`sla-alert-${a.id}`">
          <div class="min-w-0">
            <NuxtLink :to="`/admin/leads/${a.leadId}`" class="font-medium hover:underline" :data-testid="`sla-alert-lead-${a.leadId}`">{{ a.leadName }}</NuxtLink>
            <span class="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">{{ typeLabel(a.type) }}</span>
            <p class="mt-0.5 text-xs text-stone-400">
              Fase: {{ a.leadStage || 'nueva' }}{{ a.leadAgentName ? ` · ${a.leadAgentName}` : ' · sin asignar' }} · abierta desde {{ dt.date(a.openedAt) }}
            </p>
          </div>
          <button type="button" class="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:bg-stone-50" @click="resolveAlert(a.id)">
            Marcar como resuelta
          </button>
        </div>
      </div>
    </AdminPanel>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin' })
useHead({ title: 'Enrutamiento y SLA — M&M Real Estate' })
const dt = useDash()
const toast = useToast()

const settings = ref<any>(null)
const savingSettings = ref(false)
const alerts = ref<any[]>([])
const loadingAlerts = ref(false)

const TYPE_LABELS: Record<string, string> = { unattended: 'Sin atender', qualified_no_action: 'Cualificado sin acción', inactive: 'Inactivo' }
function typeLabel(t: string) {
  return TYPE_LABELS[t] || t
}

// La primera carga corre en SSR: `useRequestFetch()` lleva la cookie de sesión.
// Con un `$fetch` suelto la API respondía 401 y la página entera salía como
// «Error 401» al abrir o recargar la URL (desde el menú, en el cliente, sí iba).
const requestFetch = useRequestFetch()

async function loadSettings() {
  settings.value = await requestFetch('/api/admin/saas/leads-routing/sla-settings')
}

async function loadAlerts() {
  loadingAlerts.value = true
  try {
    const res = await requestFetch<any>('/api/admin/saas/leads-routing/sla-alerts')
    alerts.value = res.rows
  } finally {
    loadingAlerts.value = false
  }
}

async function saveSettings() {
  savingSettings.value = true
  try {
    settings.value = await $fetch('/api/admin/saas/leads-routing/sla-settings', { method: 'PUT', body: settings.value })
    toast.success('Umbrales guardados')
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || 'No se pudieron guardar los umbrales')
  } finally {
    savingSettings.value = false
  }
}

// --- Lead Score (FASE 32) ---
const FINANCING_LABELS: Record<string, string> = { approved: 'Aprobada', preapproved: 'Preaprobada', not_needed: 'Sin hipoteca', requested: 'Solicitada', required: 'Necesaria' }
const scoreSettings = ref<any>(null)
const savingScore = ref(false)
const recalculating = ref(false)
const recalcLabel = ref('Recalculando…')

async function loadScoreSettings() {
  scoreSettings.value = await requestFetch('/api/admin/saas/leads-routing/sla-settings', { query: { scope: 'score' } })
}

function toggleStatus(rule: any, status: string) {
  const list: string[] = rule.config.statuses || []
  rule.config.statuses = list.includes(status) ? list.filter((s) => s !== status) : [...list, status]
}

async function saveScoreRules() {
  savingScore.value = true
  try {
    scoreSettings.value = await $fetch('/api/admin/saas/leads-routing/sla-settings', {
      method: 'PUT',
      body: { scoreRules: scoreSettings.value.rules.map((r: any) => ({ criterion: r.criterion, points: r.points, enabled: r.enabled, priority: r.priority, config: r.config })) },
    })
    toast.success('Reglas guardadas — recalcula para aplicarlas a los leads existentes')
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || 'No se pudieron guardar las reglas')
  } finally {
    savingScore.value = false
  }
}

/** Mismo framework de acciones en bloque (progreso, resultado por lead) — nunca el tenant entero en una sola petición. */
async function recalculateAll() {
  recalculating.value = true
  recalcLabel.value = 'Iniciando…'
  try {
    const created = await $fetch<{ job: any }>('/api/admin/lead-bulk-jobs', { method: 'POST', body: { action: 'recalculate_score', params: {}, selectAllFiltered: true } })
    let job = created.job
    while (true) {
      recalcLabel.value = `${job.completedCount + job.failedCount}/${job.totalCount}…`
      const result = await $fetch<{ done: boolean; job?: any }>(`/api/admin/lead-bulk-jobs/${created.job.id}`, { method: 'PUT', body: {} })
      if (result.job) job = result.job
      if (result.done) break
    }
    toast.success(`Puntuación recalculada en ${job.completedCount} lead${job.completedCount === 1 ? '' : 's'}`)
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || 'No se pudo recalcular')
  } finally {
    recalculating.value = false
  }
}

async function resolveAlert(id: number) {
  try {
    await $fetch(`/api/admin/saas/leads-routing/sla-alerts/${id}/resolve`, { method: 'POST' })
    alerts.value = alerts.value.filter((a) => a.id !== id)
    toast.success('Alerta resuelta')
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || 'No se pudo resolver')
  }
}

await Promise.all([loadSettings(), loadAlerts(), loadScoreSettings()])
</script>
