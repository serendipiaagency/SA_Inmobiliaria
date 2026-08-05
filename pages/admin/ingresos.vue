<template>
  <div>
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Ingresos</h1>
        <p class="mt-1 text-sm text-stone-500">Ingresos reales por operaciones cerradas (ventas y alquileres) — no la facturación de la suscripción SaaS.</p>
      </div>
      <select v-model.number="months" class="input !w-44">
        <option :value="3">Últimos 3 meses</option>
        <option :value="6">Últimos 6 meses</option>
        <option :value="12">Últimos 12 meses</option>
        <option :value="24">Últimos 24 meses</option>
      </select>
    </div>

    <div class="mb-6 grid gap-4 sm:grid-cols-4">
      <AdminStatCard label="Volumen cerrado" :value="dt.money(totals.totalRevenue)" :sub="`${totals.dealCount} operaciones`" />
      <AdminStatCard label="Comisión total" :value="dt.money(totals.totalCommission)" />
      <AdminStatCard label="Comisión pagada" :value="dt.money(totals.commissionPaid)" />
      <AdminStatCard label="Comisión pendiente" :value="dt.money(totals.commissionPending)" />
    </div>

    <AdminPanel title="Por mes" class="mb-6">
      <div v-if="!byMonth.length" class="py-6 text-center text-sm text-stone-400">Sin datos en el periodo seleccionado</div>
      <div v-else class="space-y-2">
        <div v-for="m in byMonth" :key="m.month" class="flex items-center gap-3">
          <span class="w-20 shrink-0 text-xs text-stone-500">{{ m.month }}</span>
          <div class="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
            <div class="h-full rounded-full bg-ink" :style="{ width: `${maxRevenue ? (m.revenue / maxRevenue) * 100 : 0}%` }" />
          </div>
          <span class="w-28 shrink-0 text-right text-xs font-medium tabular-nums">{{ dt.money(m.revenue, { compact: true }) }}</span>
          <span class="w-16 shrink-0 text-right text-xs text-stone-400">{{ m.count }} op.</span>
        </div>
      </div>
    </AdminPanel>

    <AdminPanel title="Por agente">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b border-line text-left text-[11px] uppercase tracking-wide text-stone-400">
            <tr>
              <th class="py-2 font-semibold">Agente</th>
              <th class="py-2 text-right font-semibold">Operaciones</th>
              <th class="py-2 text-right font-semibold">Volumen</th>
              <th class="py-2 text-right font-semibold">Comisión pagada</th>
              <th class="py-2 text-right font-semibold">Comisión pendiente</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in byAgent" :key="a.agentName" class="border-b border-line/60 last:border-0">
              <td class="py-2.5 font-medium">{{ a.agentName }}</td>
              <td class="py-2.5 text-right tabular-nums">{{ a.count }}</td>
              <td class="py-2.5 text-right tabular-nums">{{ dt.money(a.revenue) }}</td>
              <td class="py-2.5 text-right tabular-nums text-emerald-700">{{ dt.money(a.commissionPaid) }}</td>
              <td class="py-2.5 text-right tabular-nums text-amber-700">{{ dt.money(a.commissionPending) }}</td>
            </tr>
            <tr v-if="!byAgent.length"><td colspan="5" class="py-10 text-center text-stone-400">Sin operaciones</td></tr>
          </tbody>
        </table>
      </div>
    </AdminPanel>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Ingresos — M&M Real Estate' })
const dt = useDash()

const months = ref(12)
const { data } = await useFetch<any>('/api/admin/saas/deals-revenue', { query: { months } })
const totals = computed(() => data.value?.totals || { dealCount: 0, totalRevenue: 0, totalCommission: 0, commissionPaid: 0, commissionPending: 0 })
const byMonth = computed<any[]>(() => data.value?.byMonth || [])
const byAgent = computed<any[]>(() => data.value?.byAgent || [])
const maxRevenue = computed(() => Math.max(1, ...byMonth.value.map((m) => m.revenue)))
</script>
