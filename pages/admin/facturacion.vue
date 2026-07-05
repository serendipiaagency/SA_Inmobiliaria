<template>
  <div>
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Facturación</h1>
        <p class="mt-1 text-sm text-stone-500">Facturas, cobros y pagos pendientes</p>
      </div>
      <button class="dash-btn-primary" @click="toast.info('La creación manual de facturas estará disponible próximamente')">+ Nueva factura</button>
    </div>

    <div v-if="data" class="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <AdminStatCard label="Cobrado" :value="dt.money(data.stats.paid, { compact: true })" />
      <AdminStatCard label="Pendiente" :value="dt.money(data.stats.pending, { compact: true })" />
      <AdminStatCard label="Vencido" :value="dt.money(data.stats.overdue, { compact: true })" />
      <AdminStatCard label="Borradores" :value="dt.money(data.stats.draft, { compact: true })" />
    </div>

    <div class="mb-4 flex flex-wrap gap-1.5">
      <button v-for="f in filters" :key="f.key" class="rounded-lg border px-3 py-1.5 text-xs font-medium transition" :class="status === f.key ? 'border-ink bg-ink text-white' : 'border-line bg-white text-stone-600 hover:border-stone-300'" @click="status = f.key">{{ f.label }}</button>
    </div>

    <AdminPanel :pad="false">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b border-line bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-400">
            <tr>
              <th class="px-4 py-2.5 font-semibold">Nº</th>
              <th class="px-4 py-2.5 font-semibold">Cliente</th>
              <th class="px-4 py-2.5 font-semibold">Concepto</th>
              <th class="px-4 py-2.5 text-right font-semibold">Importe</th>
              <th class="px-4 py-2.5 font-semibold">Emitida</th>
              <th class="px-4 py-2.5 font-semibold">Vence</th>
              <th class="px-4 py-2.5 font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="inv in rows" :key="inv.id" class="border-b border-line/60 last:border-0 hover:bg-stone-50">
              <td class="px-4 py-3 font-mono text-xs text-stone-500">{{ inv.number }}</td>
              <td class="px-4 py-3 font-medium">{{ inv.clientName }}</td>
              <td class="px-4 py-3 text-stone-600">{{ inv.concept }}</td>
              <td class="px-4 py-3 text-right font-semibold tabular-nums">{{ dt.money(inv.amount + inv.tax) }}</td>
              <td class="px-4 py-3 text-stone-600">{{ dt.date(inv.issuedAt) }}</td>
              <td class="px-4 py-3" :class="isOverdue(inv) ? 'font-medium text-rose-600' : 'text-stone-600'">{{ dt.date(inv.dueAt) }}</td>
              <td class="px-4 py-3"><AdminStatusPill :status="inv.status" /></td>
            </tr>
            <tr v-if="!rows.length"><td colspan="7" class="px-4 py-10 text-center text-stone-400">Sin facturas</td></tr>
          </tbody>
        </table>
      </div>
    </AdminPanel>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Facturación — M&M Real Estate' })
const dt = useDash()
const toast = useToast()

const status = ref('all')
const { data } = await useFetch<any>('/api/admin/saas/invoices', { query: { status } })
const rows = computed<any[]>(() => data.value?.rows || [])
const filters = [
  { key: 'all', label: 'Todas' },
  { key: 'paid', label: 'Pagadas' },
  { key: 'pending', label: 'Pendientes' },
  { key: 'overdue', label: 'Vencidas' },
  { key: 'draft', label: 'Borradores' },
]
function isOverdue(inv: any) {
  return inv.status === 'overdue'
}
</script>

<style scoped>
.dash-btn-primary {
  @apply inline-flex items-center rounded-lg bg-ink px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-black active:scale-[0.97];
}
</style>
