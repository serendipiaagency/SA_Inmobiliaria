<!--
  Dashboard comercial (FASE 33). Todos los números salen de
  server/utils/dashboard/commercial.ts — aquí no se calcula ningún KPI. Cada
  tarjeta enseña su definición y, cuando tiene sentido, abre el listado
  filtrado con el mismo scope.
-->
<template>
  <div>
    <header class="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">Rendimiento comercial</h1>
        <p class="mt-1 text-sm text-stone-500">KPIs reales del periodo elegido, con su definición. Fechas en UTC.</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <select v-model="preset" class="cfg-input !w-40" data-testid="dash-preset" @change="applyPreset">
          <option value="today">Hoy</option>
          <option value="7d">Últimos 7 días</option>
          <option value="30d">Últimos 30 días</option>
          <option value="month">Mes actual</option>
          <option value="quarter">Trimestre actual</option>
          <option value="custom">Personalizado</option>
        </select>
        <template v-if="preset === 'custom'">
          <input v-model="scope.from" type="date" class="cfg-input !w-36" data-testid="dash-from">
          <input v-model="scope.to" type="date" class="cfg-input !w-36" data-testid="dash-to">
        </template>
        <label class="flex items-center gap-1.5 text-xs text-stone-600">
          <input v-model="scope.compare" type="checkbox" data-testid="dash-compare"> Comparar con el periodo anterior
        </label>
      </div>
    </header>

    <!-- Filtros combinables (§100) -->
    <div class="mb-5 flex flex-wrap gap-2" data-testid="dash-filters">
      <select v-model="scope.commercialId" class="cfg-input !w-44" data-testid="dash-commercial">
        <option value="">Todo el equipo</option>
        <option v-for="c in options?.commercials || []" :key="c.id" :value="String(c.id)">{{ c.name }}</option>
      </select>
      <select v-if="options?.offices?.length" v-model="scope.office" class="cfg-input !w-40">
        <option value="">Todas las oficinas</option>
        <option v-for="o in options.offices" :key="o" :value="o">{{ o }}</option>
      </select>
      <select v-model="scope.source" class="cfg-input !w-40" data-testid="dash-source">
        <option value="">Todos los orígenes</option>
        <option v-for="s in options?.sources || []" :key="s" :value="s">{{ s }}</option>
      </select>
      <select v-if="options?.portals?.length" v-model="scope.portal" class="cfg-input !w-40">
        <option value="">Todos los portales</option>
        <option v-for="p in options.portals" :key="p" :value="p">{{ p }}</option>
      </select>
      <select v-if="options?.campaigns?.length" v-model="scope.campaign" class="cfg-input !w-44">
        <option value="">Todas las campañas</option>
        <option v-for="c in options.campaigns" :key="c" :value="c">{{ c }}</option>
      </select>
      <select v-if="options?.properties?.length" v-model="scope.propertyId" class="cfg-input !w-52">
        <option value="">Todos los inmuebles</option>
        <option v-for="p in options.properties" :key="p.id" :value="String(p.id)">{{ p.name }}</option>
      </select>
    </div>

    <p v-if="error" class="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{{ error }}</p>
    <p v-else-if="pending && !data" class="py-10 text-center text-sm text-stone-400">Cargando…</p>

    <template v-if="data">
      <p class="mb-3 text-xs text-stone-400">
        Periodo {{ data.scope.from }} → {{ data.scope.to }}<span v-if="data.comparison"> · comparado con {{ data.comparison.from }} → {{ data.comparison.to }}</span>
      </p>

      <!-- Lo accionable primero (§107-108) -->
      <div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="dash-actionable">
        <DashKpi label="Leads sin atender" :kpi="data.kpis.unattendedLeads" tone="alert" testid="kpi-unattended" />
        <DashKpi label="Visitas próximas" :kpi="data.kpis.upcomingViewings" testid="kpi-upcoming" />
        <DashKpi label="Ofertas pendientes" :kpi="data.kpis.pendingOffers" testid="kpi-pending-offers" />
        <DashKpi label="Tareas vencidas" :kpi="data.kpis.overdueTasks" tone="alert" testid="kpi-overdue-tasks" />
      </div>

      <div class="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="dash-period">
        <DashKpi label="Leads nuevos" :kpi="data.kpis.newLeads" :previous="data.comparison?.newLeads" testid="kpi-new-leads" />
        <DashKpi label="Leads cualificados" :kpi="data.kpis.qualifiedLeads" :previous="data.comparison?.qualifiedLeads" testid="kpi-qualified" />
        <div class="rounded-xl border border-line bg-white p-4" data-testid="kpi-first-response">
          <p class="text-xs font-medium text-stone-500">Primera respuesta</p>
          <p class="mt-1 text-2xl font-semibold tabular-nums">{{ formatMinutes(data.kpis.firstResponse.medianMinutes) }}</p>
          <p class="text-[11px] text-stone-400">mediana · media {{ formatMinutes(data.kpis.firstResponse.avgMinutes) }} · {{ data.kpis.firstResponse.responded }}/{{ data.kpis.firstResponse.cohort }} respondidos</p>
          <p class="mt-2 text-[11px] leading-snug text-stone-400">{{ data.kpis.firstResponse.definition }}</p>
        </div>
        <DashKpi label="Visitas realizadas" :kpi="data.kpis.completedViewings" :previous="data.comparison?.completedViewings" testid="kpi-completed-viewings" />
        <DashKpi label="Ofertas" :kpi="data.kpis.offers" :previous="data.comparison?.offers" testid="kpi-offers" />
        <DashKpi label="Operaciones abiertas" :kpi="data.kpis.dealsCreated" testid="kpi-deals-created" />
        <DashKpi label="Operaciones cerradas" :kpi="data.kpis.dealsClosed" :previous="data.comparison?.dealsClosed" testid="kpi-deals-closed" />
        <DashKpi label="Conversión" :kpi="data.kpis.conversion" suffix="%" testid="kpi-conversion" />
      </div>

      <AdminPanel title="Embudo de la cohorte" class="mb-6" data-testid="dash-funnel">
        <p class="mb-3 text-xs text-stone-500">{{ data.funnel.definition }}</p>
        <div class="space-y-2">
          <div v-for="st in data.funnel.stages" :key="st.key" class="flex items-center gap-3 text-sm" :data-testid="`funnel-${st.key}`">
            <span class="w-28 shrink-0 text-stone-600">{{ st.label }}</span>
            <div class="h-6 flex-1 rounded bg-stone-100">
              <div class="flex h-6 items-center rounded bg-ink/80 px-2 text-xs font-semibold text-white" :style="{ width: `${barWidth(st.value)}%`, minWidth: st.value ? '2rem' : '0' }">{{ st.value }}</div>
            </div>
            <span class="w-14 shrink-0 text-right text-xs text-stone-400">{{ pctOfFirst(st.value) }}</span>
          </div>
        </div>
      </AdminPanel>

      <AdminPanel title="Por comercial (misma cohorte)" :pad="false">
        <div class="overflow-x-auto">
          <table class="w-full text-sm" data-testid="dash-by-commercial">
            <thead class="border-b border-line bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-400">
              <tr>
                <th class="px-4 py-2.5 font-semibold">Comercial</th>
                <th class="px-4 py-2.5 font-semibold">Oficina</th>
                <th class="px-4 py-2.5 text-right font-semibold">Leads</th>
                <th class="px-4 py-2.5 text-right font-semibold">Cualificados</th>
                <th class="px-4 py-2.5 text-right font-semibold">Operaciones cerradas</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!data.byCommercial.length"><td colspan="5" class="px-4 py-6 text-center text-stone-400">Sin leads en este periodo con estos filtros.</td></tr>
              <tr v-for="r in data.byCommercial" :key="r.commercialId ?? 'none'" class="border-b border-line/60 last:border-0">
                <td class="px-4 py-2.5 font-medium">{{ r.name }}</td>
                <td class="px-4 py-2.5 text-stone-500">{{ r.office || '—' }}</td>
                <td class="px-4 py-2.5 text-right tabular-nums">{{ r.leads }}</td>
                <td class="px-4 py-2.5 text-right tabular-nums">{{ r.qualified }}</td>
                <td class="px-4 py-2.5 text-right tabular-nums">{{ r.closed }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </AdminPanel>
    </template>
  </div>
</template>

<script setup lang="ts">
import { defineComponent, h, resolveComponent } from 'vue'

definePageMeta({ layout: 'admin' })
useHead({ title: 'Rendimiento comercial — M&M Real Estate' })

const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

const preset = ref('30d')
const scope = reactive({ from: daysAgo(29), to: today(), compare: false, commercialId: '', office: '', source: '', portal: '', campaign: '', propertyId: '' })

function applyPreset() {
  const d = new Date()
  const iso = (x: Date) => x.toISOString().slice(0, 10)
  if (preset.value === 'today') Object.assign(scope, { from: today(), to: today() })
  else if (preset.value === '7d') Object.assign(scope, { from: daysAgo(6), to: today() })
  else if (preset.value === '30d') Object.assign(scope, { from: daysAgo(29), to: today() })
  else if (preset.value === 'month') Object.assign(scope, { from: iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))), to: today() })
  else if (preset.value === 'quarter') Object.assign(scope, { from: iso(new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1))), to: today() })
}

const { data: options } = await useFetch<any>('/api/admin/saas/overview', { query: { view: 'commercial-options' } })
const { data, pending, error: fetchError } = await useFetch<any>('/api/admin/saas/overview', {
  query: computed(() => ({ view: 'commercial', ...scope, compare: scope.compare ? '1' : '' })),
})
const error = computed(() => (fetchError.value ? (fetchError.value as any)?.data?.statusMessage || 'No se pudo cargar el dashboard' : ''))

function formatMinutes(m: number | null) {
  if (m === null || m === undefined) return '—'
  if (m < 60) return `${m} min`
  if (m < 1440) return `${Math.round((m / 60) * 10) / 10} h`
  return `${Math.round((m / 1440) * 10) / 10} d`
}
function barWidth(v: number) {
  const first = data.value?.funnel?.stages?.[0]?.value || 0
  return first ? Math.max(0, Math.round((v / first) * 100)) : 0
}
function pctOfFirst(v: number) {
  const first = data.value?.funnel?.stages?.[0]?.value || 0
  return first ? `${Math.round((v / first) * 1000) / 10}%` : '—'
}

/** Tarjeta de KPI: valor, definición, variación sólo si hay periodo comparativo explícito (§80) y enlace al detalle (§101). */
const DashKpi = defineComponent({
  props: { label: String, kpi: Object, previous: Number, suffix: { type: String, default: '' }, tone: { type: String, default: '' }, testid: String },
  setup(props) {
    const NuxtLink = resolveComponent('NuxtLink')
    return () => {
      const k: any = props.kpi || {}
      const value = k.value === null || k.value === undefined ? '—' : `${k.value}${props.suffix}`
      const delta =
        typeof props.previous === 'number' && typeof k.value === 'number'
          ? props.previous === 0
            ? null
            : Math.round(((k.value - props.previous) / props.previous) * 1000) / 10
          : null
      const body = [
        h('p', { class: 'text-xs font-medium text-stone-500' }, props.label),
        h('p', { class: ['mt-1 text-2xl font-semibold tabular-nums', props.tone === 'alert' && k.value > 0 ? 'text-red-600' : ''] }, value),
        typeof props.previous === 'number' ? h('p', { class: 'text-[11px] text-stone-400' }, `antes: ${props.previous}${delta !== null ? ` (${delta > 0 ? '+' : ''}${delta}%)` : ''}`) : null,
        h('p', { class: 'mt-2 text-[11px] leading-snug text-stone-400' }, k.definition || ''),
      ]
      const cls = 'block rounded-xl border border-line bg-white p-4'
      return k.link ? h(NuxtLink, { to: k.link, class: `${cls} hover:border-ink/40`, 'data-testid': props.testid }, () => body) : h('div', { class: cls, 'data-testid': props.testid }, body)
    }
  },
})
</script>
