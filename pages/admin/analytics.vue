<template>
  <div>
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p class="mt-1 text-sm text-stone-500">Tráfico, adquisición y conversión</p>
      </div>
      <div class="flex gap-1 rounded-lg bg-stone-100 p-0.5">
        <button v-for="r in ranges" :key="r" class="rounded-md px-3 py-1.5 text-xs font-medium transition" :class="range === r ? 'bg-white text-ink shadow-sm' : 'text-stone-500'" @click="range = r">{{ r }}d</button>
      </div>
    </div>

    <div v-if="pending" class="skeleton h-64 rounded-xl border border-line" />

    <template v-else-if="data">
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard label="Visitantes" :value="dt.num(data.totals.visitors)" :spark="col('visitors')" />
        <AdminStatCard label="Páginas vistas" :value="dt.num(data.totals.pageviews)" :spark="col('pageviews')" />
        <AdminStatCard label="Leads generados" :value="dt.num(data.totals.leads)" :spark="col('leads')" />
        <AdminStatCard label="Ingresos" :value="dt.money(data.totals.revenue, { compact: true })" :spark="col('revenue')" />
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-3">
        <AdminPanel class="lg:col-span-2" title="Visitantes vs. Leads">
          <div class="mb-3 flex gap-4 text-xs">
            <span class="flex items-center gap-1.5"><span class="h-2 w-4 rounded-full bg-ink" />Visitantes</span>
            <span class="flex items-center gap-1.5"><span class="h-2 w-4 rounded-full" style="background:#c2703d" />Leads (×10)</span>
          </div>
          <AdminAreaChart :values="col('visitors')" :labels="labels" :h="220" :format="(v) => dt.num(v)" />
        </AdminPanel>

        <AdminPanel title="Embudo de adquisición">
          <AdminFunnelBars :rows="data.funnel" :format="(v) => dt.num(v)" />
          <p class="mt-4 border-t border-line pt-3 text-xs text-stone-500">
            Conversión global visitante → reserva:
            <span class="font-semibold text-ink">{{ globalConv }}%</span>
          </p>
        </AdminPanel>
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-2">
        <AdminPanel title="Origen de leads">
          <AdminDonut :data="sourceData" :size="140" />
        </AdminPanel>
        <AdminPanel title="Tipos de cliente">
          <AdminDonut :data="clientData" :size="140" />
        </AdminPanel>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Analytics — SA Inmobiliaria' })
const dt = useDash()

const ranges = [7, 30, 90]
const range = ref(30)
const { data, pending } = await useFetch<any>('/api/admin/saas/analytics', { query: { range } })

const series = computed<any[]>(() => data.value?.series || [])
function col(key: string) {
  return series.value.map((r) => r[key] || 0)
}
const labels = computed(() => series.value.map((r) => dt.date(r.day, false)))
const sourceData = computed(() => (data.value?.sources || []).map((s: any) => ({ label: s.source, value: s.n })))
const clientData = computed(() => (data.value?.clientTypes || []).map((s: any) => ({ label: s.type, value: s.n })))
const globalConv = computed(() => {
  const t = data.value?.totals
  return t && t.visitors ? Math.round((t.reservations / t.visitors) * 1000) / 10 : 0
})
</script>
