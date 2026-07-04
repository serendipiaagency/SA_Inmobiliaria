<template>
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">Reservas</h1>
      <p class="mt-1 text-sm text-stone-500">Reservas de propiedades y depósitos</p>
    </div>

    <div v-if="data" class="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <AdminStatCard label="Valor asegurado" :value="dt.money(data.stats.securedValue, { compact: true })" sub="Confirmadas + completadas" />
      <AdminStatCard label="Valor pendiente" :value="dt.money(data.stats.pendingValue, { compact: true })" :sub="`${data.stats.pending} pendientes`" />
      <AdminStatCard label="Confirmadas" :value="dt.num(data.stats.confirmed)" />
      <AdminStatCard label="Total reservas" :value="dt.num(data.stats.total)" />
    </div>

    <div class="mb-4 flex flex-wrap gap-1.5">
      <button v-for="f in filters" :key="f.key" class="rounded-lg border px-3 py-1.5 text-xs font-medium transition" :class="status === f.key ? 'border-ink bg-ink text-white' : 'border-line bg-white text-stone-600 hover:border-stone-300'" @click="status = f.key">{{ f.label }}</button>
    </div>

    <AdminPanel :pad="false">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b border-line bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-400">
            <tr>
              <th class="px-4 py-2.5 font-semibold">Referencia</th>
              <th class="px-4 py-2.5 font-semibold">Cliente</th>
              <th class="px-4 py-2.5 font-semibold">Propiedad</th>
              <th class="px-4 py-2.5 text-right font-semibold">Importe</th>
              <th class="px-4 py-2.5 text-right font-semibold">Depósito</th>
              <th class="px-4 py-2.5 font-semibold">Fecha</th>
              <th class="px-4 py-2.5 font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id" class="border-b border-line/60 last:border-0 hover:bg-stone-50">
              <td class="px-4 py-3 font-mono text-xs text-stone-500">{{ r.reference }}</td>
              <td class="px-4 py-3 font-medium">{{ r.clientName }}</td>
              <td class="px-4 py-3 text-stone-600">{{ r.propertyName }}</td>
              <td class="px-4 py-3 text-right font-semibold tabular-nums">{{ dt.money(r.amount, { compact: true }) }}</td>
              <td class="px-4 py-3 text-right tabular-nums text-stone-600">{{ dt.money(r.deposit, { compact: true }) }}</td>
              <td class="px-4 py-3 text-stone-600">{{ dt.date(r.reservedAt) }}</td>
              <td class="px-4 py-3"><AdminStatusPill :status="r.status" /></td>
            </tr>
            <tr v-if="!rows.length"><td colspan="7" class="px-4 py-10 text-center text-stone-400">Sin reservas</td></tr>
          </tbody>
        </table>
      </div>
    </AdminPanel>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Reservas — SA Inmobiliaria' })
const dt = useDash()

const status = ref('all')
const { data } = await useFetch<any>('/api/admin/saas/reservations', { query: { status } })
const rows = computed<any[]>(() => data.value?.rows || [])
const filters = [
  { key: 'all', label: 'Todas' },
  { key: 'pending', label: 'Pendientes' },
  { key: 'confirmed', label: 'Confirmadas' },
  { key: 'completed', label: 'Completadas' },
  { key: 'cancelled', label: 'Canceladas' },
]
</script>
