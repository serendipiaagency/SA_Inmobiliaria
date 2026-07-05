<template>
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">Clientes</h1>
      <p class="mt-1 text-sm text-stone-500">Cartera de clientes y valor de vida</p>
    </div>

    <div v-if="data" class="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <AdminStatCard label="Total clientes" :value="dt.num(data.stats.total)" />
      <AdminStatCard label="Activos" :value="dt.num(data.stats.active)" />
      <AdminStatCard label="Valor de cartera" :value="dt.money(data.stats.ltv, { compact: true })" />
      <AdminStatCard label="Operaciones" :value="dt.num(data.stats.deals)" />
    </div>

    <div class="mb-4 flex flex-wrap items-center gap-2">
      <div class="relative">
        <svg class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
        <input v-model="search" type="search" placeholder="Buscar cliente…" class="w-60 rounded-lg border border-line bg-white py-2 pl-9 pr-3 text-sm focus:border-ink" />
      </div>
      <select v-model="type" class="rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink">
        <option value="all">Todos los tipos</option>
        <option value="buyer">Comprador</option>
        <option value="seller">Vendedor</option>
        <option value="tenant">Inquilino</option>
        <option value="investor">Inversor</option>
      </select>
      <select v-model="stage" class="rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink">
        <option value="all">Todos los estados</option>
        <option value="active">Activo</option>
        <option value="closed">Cerrado</option>
        <option value="inactive">Inactivo</option>
      </select>
    </div>

    <AdminPanel :pad="false">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b border-line bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-400">
            <tr>
              <th class="px-4 py-2.5 font-semibold">Cliente</th>
              <th class="px-4 py-2.5 font-semibold">Tipo</th>
              <th class="px-4 py-2.5 font-semibold">Estado</th>
              <th class="px-4 py-2.5 font-semibold">Ubicación</th>
              <th class="px-4 py-2.5 text-right font-semibold">Operaciones</th>
              <th class="px-4 py-2.5 text-right font-semibold">Valor de vida</th>
              <th class="px-4 py-2.5 font-semibold">Agente</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in rows" :key="c.id" class="border-b border-line/60 last:border-0 hover:bg-stone-50">
              <td class="px-4 py-3">
                <div class="flex items-center gap-2.5">
                  <span class="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-white">{{ dt.initials(c.name) }}</span>
                  <div>
                    <p class="font-medium">{{ c.name }}</p>
                    <p class="text-xs text-stone-400">{{ c.email }}</p>
                  </div>
                </div>
              </td>
              <td class="px-4 py-3"><span class="rounded-md bg-stone-100 px-2 py-0.5 text-xs font-medium capitalize text-stone-600">{{ typeLabel(c.type) }}</span></td>
              <td class="px-4 py-3"><AdminStatusPill :status="c.stage" /></td>
              <td class="px-4 py-3 text-stone-600">{{ c.location }}</td>
              <td class="px-4 py-3 text-right tabular-nums">{{ c.dealsCount }}</td>
              <td class="px-4 py-3 text-right font-semibold tabular-nums">{{ dt.money(c.lifetimeValue, { compact: true }) }}</td>
              <td class="px-4 py-3 text-stone-600">{{ c.agentName }}</td>
            </tr>
            <tr v-if="!rows.length"><td colspan="7" class="px-4 py-10 text-center text-stone-400">Sin resultados</td></tr>
          </tbody>
        </table>
      </div>
    </AdminPanel>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Clientes — M&M Real Estate' })
const dt = useDash()

const search = ref('')
const type = ref('all')
const stage = ref('all')
const { data } = await useFetch<any>('/api/admin/saas/clients', { query: { search, type, stage } })
const rows = computed<any[]>(() => data.value?.rows || [])

function typeLabel(t: string) {
  return { buyer: 'Comprador', seller: 'Vendedor', tenant: 'Inquilino', investor: 'Inversor' }[t] || t
}
</script>
