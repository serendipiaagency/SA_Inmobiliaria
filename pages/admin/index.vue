<template>
  <div>
    <!-- Header -->
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p class="mt-1 text-sm text-stone-500">Resumen de los últimos 30 días · datos a {{ dt.date(data?.anchor) }}</p>
      </div>
      <div class="flex items-center gap-2">
        <NuxtLink to="/admin/analytics" class="dash-btn">Ver analytics</NuxtLink>
        <NuxtLink to="/admin/leads" class="dash-btn-primary">+ Nuevo lead</NuxtLink>
      </div>
    </div>

    <div v-if="pending" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <div v-for="i in 5" :key="i" class="skeleton h-32 rounded-xl border border-line" />
    </div>

    <template v-else-if="data">
      <!-- KPIs -->
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <AdminStatCard label="Ingresos (30d)" :value="dt.money(data.kpis.revenue.value, { compact: true })" :delta="data.kpis.revenue.delta" :spark="spark('revenue')" />
        <AdminStatCard label="Nuevos leads" :value="dt.num(data.kpis.leads.value)" :delta="data.kpis.leads.delta" :spark="spark('leads')" />
        <AdminStatCard label="Reservas" :value="dt.num(data.kpis.reservations.value)" :delta="data.kpis.reservations.delta" :spark="spark('reservations')" />
        <AdminStatCard label="Visitantes web" :value="dt.num(data.kpis.visitors.value)" :delta="data.kpis.visitors.delta" :spark="spark('visitors')" />
        <AdminStatCard label="Conversión" :value="`${data.kpis.conversion.value}%`" :delta="data.kpis.conversion.delta" sub="Visitante → reserva" />
      </div>

      <!-- Chart + funnel -->
      <div class="mt-4 grid gap-4 lg:grid-cols-3">
        <AdminPanel class="lg:col-span-2" title="Rendimiento" sub="Últimos 90 días">
          <template #action>
            <div class="flex gap-1 rounded-lg bg-stone-100 p-0.5">
              <button v-for="m in metrics" :key="m.key" class="rounded-md px-2.5 py-1 text-xs font-medium transition" :class="metric === m.key ? 'bg-white text-ink shadow-sm' : 'text-stone-500'" @click="metric = m.key">{{ m.label }}</button>
            </div>
          </template>
          <AdminAreaChart :values="chartValues" :labels="chartLabels" :h="230" :format="chartFormat" />
        </AdminPanel>

        <AdminPanel title="Embudo de leads">
          <AdminFunnelBars :rows="funnelRows" />
          <div class="mt-5 border-t border-line pt-4">
            <p class="mb-2 text-[11px] font-semibold uppercase tracking-widest text-stone-400">Origen de leads</p>
            <AdminDonut :data="sourceData" :size="120" />
          </div>
        </AdminPanel>
      </div>

      <!-- Secondary row -->
      <div class="mt-4 grid gap-4 lg:grid-cols-3">
        <AdminPanel class="lg:col-span-2" title="Ranking de agentes" sub="Por operaciones ganadas">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-line text-left text-[11px] uppercase tracking-wide text-stone-400">
                  <th class="pb-2 font-semibold">Agente</th>
                  <th class="pb-2 text-right font-semibold">Leads</th>
                  <th class="pb-2 text-right font-semibold">Ganados</th>
                  <th class="pb-2 text-right font-semibold">Win rate</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(a, i) in data.leaderboard" :key="a.agent" class="border-b border-line/60 last:border-0">
                  <td class="py-2.5">
                    <div class="flex items-center gap-2.5">
                      <span class="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold text-white" :style="{ background: avatarColor(i) }">{{ dt.initials(a.agent) }}</span>
                      <span class="font-medium">{{ a.agent }}</span>
                    </div>
                  </td>
                  <td class="py-2.5 text-right tabular-nums text-stone-600">{{ a.leads }}</td>
                  <td class="py-2.5 text-right tabular-nums font-semibold">{{ a.won }}</td>
                  <td class="py-2.5 text-right">
                    <span class="inline-flex items-center gap-2">
                      <span class="hidden h-1.5 w-16 overflow-hidden rounded-full bg-stone-100 sm:inline-block"><span class="block h-full rounded-full bg-ink" :style="{ width: `${a.winRate}%` }" /></span>
                      <span class="tabular-nums text-stone-600">{{ a.winRate }}%</span>
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </AdminPanel>

        <div class="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <div class="rounded-xl border border-line bg-white p-4">
            <p class="text-[11px] font-semibold uppercase tracking-widest text-stone-400">Clientes activos</p>
            <p class="mt-1.5 text-2xl font-semibold">{{ dt.num(data.totals.clients) }}</p>
          </div>
          <div class="rounded-xl border border-line bg-white p-4">
            <p class="text-[11px] font-semibold uppercase tracking-widest text-stone-400">Visitas próximas</p>
            <p class="mt-1.5 text-2xl font-semibold">{{ dt.num(data.totals.upcomingVisits) }}</p>
          </div>
          <div class="col-span-2 rounded-xl border border-line bg-white p-4 lg:col-span-1">
            <p class="text-[11px] font-semibold uppercase tracking-widest text-stone-400">Por cobrar</p>
            <p class="mt-1.5 text-2xl font-semibold">{{ dt.money(data.totals.outstanding, { compact: true }) }}</p>
            <p class="mt-0.5 text-xs text-stone-500">{{ data.totals.pendingInvoices }} facturas pendientes</p>
          </div>
        </div>
      </div>

      <!-- Activity -->
      <div class="mt-4 grid gap-4 lg:grid-cols-3">
        <AdminPanel title="Actividad reciente">
          <ul class="space-y-3">
            <li v-for="(a, i) in data.activity.recentLeads" :key="i" class="flex items-start gap-3 text-sm">
              <span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" /></svg>
              </span>
              <div class="min-w-0 flex-1">
                <p class="truncate"><span class="font-medium">{{ a.title }}</span> <span class="text-stone-500">— nuevo lead</span></p>
                <p class="text-xs text-stone-400">{{ a.meta }} · {{ dt.relative(a.at) }}</p>
              </div>
            </li>
          </ul>
        </AdminPanel>

        <AdminPanel title="Últimas reservas">
          <ul class="space-y-3">
            <li v-for="(a, i) in data.activity.recentRes" :key="i" class="flex items-start gap-3 text-sm">
              <span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
              </span>
              <div class="min-w-0 flex-1">
                <p class="truncate"><span class="font-medium">{{ a.title }}</span></p>
                <p class="text-xs text-stone-400">{{ a.meta }} · {{ dt.relative(a.at) }}</p>
              </div>
              <span class="shrink-0 text-xs font-semibold tabular-nums">{{ dt.money(a.amount, { compact: true }) }}</span>
            </li>
          </ul>
        </AdminPanel>

        <AdminPanel title="Próximas visitas">
          <ul class="space-y-3">
            <li v-for="(a, i) in data.activity.upcoming" :key="i" class="flex items-start gap-3 text-sm">
              <span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" /></svg>
              </span>
              <div class="min-w-0 flex-1">
                <p class="truncate"><span class="font-medium">{{ a.title }}</span></p>
                <p class="text-xs text-stone-400">{{ a.meta }}</p>
              </div>
              <span class="shrink-0 text-xs font-medium text-stone-500">{{ dt.relative(a.at) }}</span>
            </li>
            <li v-if="!data.activity.upcoming.length" class="text-sm text-stone-400">Sin visitas programadas.</li>
          </ul>
        </AdminPanel>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Dashboard — M&M Real Estate' })
const dt = useDash()

const { data, pending } = await useFetch<any>('/api/admin/saas/overview')

const metrics = [
  { key: 'revenue', label: 'Ingresos' },
  { key: 'leads', label: 'Leads' },
  { key: 'visitors', label: 'Visitantes' },
  { key: 'reservations', label: 'Reservas' },
]
const metric = ref('revenue')

const series = computed<any[]>(() => data.value?.series || [])
function spark(key: string) {
  return series.value.slice(-30).map((r) => r[key] || 0)
}
const chartValues = computed(() => series.value.map((r) => r[metric.value] || 0))
const chartLabels = computed(() => series.value.map((r) => dt.date(r.day, false)))
function chartFormat(v: number) {
  return metric.value === 'revenue' ? dt.money(v, { compact: true }) : dt.num(v)
}

const funnelRows = computed(() => {
  const f = data.value?.funnel || {}
  return [
    { stage: 'Nuevos', value: f.new || 0 },
    { stage: 'Contactados', value: f.contacted || 0 },
    { stage: 'Cualificados', value: f.qualified || 0 },
    { stage: 'Propuesta', value: f.proposal || 0 },
    { stage: 'Ganados', value: f.won || 0 },
  ]
})
const sourceData = computed(() => (data.value?.sources || []).map((s: any) => ({ label: s.source, value: s.n })))

const avatarPalette = ['#16150f', '#c2703d', '#4a6fa5', '#6b8f71', '#8a867e']
function avatarColor(i: number) {
  return avatarPalette[i % avatarPalette.length]
}
</script>

<style scoped>
.dash-btn {
  @apply inline-flex items-center rounded-lg border border-line bg-white px-3.5 py-2 text-[13px] font-medium text-stone-600 transition hover:border-ink hover:text-ink;
}
.dash-btn-primary {
  @apply inline-flex items-center rounded-lg bg-ink px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-black;
}
</style>
