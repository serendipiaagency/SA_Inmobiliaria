<template>
  <div>
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Clientes</h1>
        <p class="mt-1 text-sm text-stone-500">{{ data?.stats.total ?? 0 }} cliente{{ data?.stats.total === 1 ? '' : 's' }} en tu cartera</p>
      </div>
      <NuxtLink to="/admin/clientes/nuevo" class="btn-primary">+ Nuevo cliente</NuxtLink>
    </div>

    <div v-if="data" class="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <AdminStatCard label="Total clientes" :value="dt.num(data.stats.total)" />
      <AdminStatCard label="Activos" :value="dt.num(data.stats.active)" />
      <AdminStatCard label="Operaciones cerradas" :value="dt.num(data.stats.deals)" />
      <AdminStatCard label="Volumen cerrado" :value="dt.money(data.stats.volume, { compact: true })" />
    </div>

    <div class="mb-4 flex flex-wrap items-center gap-2">
      <div class="relative">
        <svg class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
        <input v-model="search" type="search" placeholder="Nombre, email, teléfono o ubicación…" class="w-72 rounded-lg border border-line bg-white py-2 pl-9 pr-3 text-sm focus:border-ink" >
      </div>
      <select v-model="type" class="rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink">
        <option value="all">Todos los tipos</option>
        <option v-for="t in CLIENT_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
      </select>
      <select v-model="stage" class="rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink">
        <option value="all">Todos los estados</option>
        <option v-for="s in CLIENT_STAGES" :key="s.value" :value="s.value">{{ s.label }}</option>
      </select>
      <select v-if="data?.agents?.length" v-model="agent" class="rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink">
        <option value="all">Todos los comerciales</option>
        <option v-for="a in data.agents" :key="a" :value="a">{{ a }}</option>
      </select>
      <button v-if="hasFilters" type="button" class="text-[12px] font-medium text-stone-400 hover:text-ink hover:underline" @click="clearFilters">Limpiar</button>
    </div>

    <AdminPanel :pad="false">
      <div v-if="pending" class="px-4 py-16 text-center text-sm text-stone-400">Cargando…</div>
      <div v-else-if="!rows.length" class="px-4 py-16 text-center">
        <p class="text-sm font-medium text-stone-500">No se han encontrado clientes</p>
        <p class="mt-1 text-xs text-stone-400">{{ hasFilters ? 'Prueba a ajustar la búsqueda o los filtros.' : 'Crea el primero con "+ Nuevo cliente".' }}</p>
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b border-line bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-400">
            <tr>
              <th class="px-4 py-2.5 font-semibold">Cliente</th>
              <th class="px-4 py-2.5 font-semibold">Contacto</th>
              <th class="px-4 py-2.5 font-semibold">Estado</th>
              <th class="px-4 py-2.5 font-semibold">Comercial</th>
              <th class="px-4 py-2.5 font-semibold">Actividad</th>
              <th class="px-4 py-2.5 text-right font-semibold"/>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in rows" :key="c.id" class="border-b border-line/60 last:border-0 hover:bg-stone-50">
              <td class="px-4 py-3">
                <NuxtLink :to="`/admin/clientes/${c.id}`" class="flex items-center gap-3">
                  <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper text-[12px] font-semibold text-stone-500 ring-1 ring-line">{{ initials(c.name) }}</span>
                  <span class="min-w-0">
                    <span class="block truncate font-medium text-ink hover:underline">{{ c.name }}</span>
                    <span class="block text-[11px] text-stone-400">{{ c.location || '—' }}</span>
                  </span>
                </NuxtLink>
              </td>
              <td class="px-4 py-3 text-stone-600">
                <span class="block truncate">{{ c.email || '—' }}</span>
                <span class="block text-[12px] text-stone-400">{{ c.phone || '—' }}</span>
              </td>
              <td class="px-4 py-3">
                <div class="flex flex-wrap items-center gap-1">
                  <ClientBadge :value="c.stage" kind="stage" />
                  <ClientBadge :value="c.type" kind="type" />
                </div>
              </td>
              <td class="px-4 py-3 text-stone-600">{{ c.agentName || '—' }}</td>
              <td class="px-4 py-3 text-stone-600">
                <span class="block text-[12px]">
                  {{ c.visitsCount }} visita{{ c.visitsCount === 1 ? '' : 's' }} · {{ c.dealsClosed }} operación{{ c.dealsClosed === 1 ? '' : 'es' }}
                </span>
                <span class="block text-[11px] text-stone-400">{{ c.lastActivityAt ? `Última: ${formatRelative(c.lastActivityAt)}` : 'Sin actividad' }}</span>
              </td>
              <td class="px-4 py-3 text-right">
                <ClientRowMenu :client="c" @deleted="refresh" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AdminPanel>

    <p class="mt-3 px-1 text-[11px] text-stone-400">
      Las visitas y operaciones de cada fila se cruzan por email o nombre exacto: el modelo no guarda todavía un
      vínculo directo entre un cliente y su histórico.
    </p>
  </div>
</template>

<script setup lang="ts">
import ClientBadge from '~/components/client-builder/ClientBadge.vue'
import ClientRowMenu from '~/components/client-builder/ClientRowMenu.vue'
import { CLIENT_TYPES, CLIENT_STAGES, formatRelative, initials } from '~/composables/useClientConfig'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Clientes' })

const dt = useDash()

const search = ref('')
const type = ref('all')
const stage = ref('all')
const agent = ref('all')

const hasFilters = computed(() => !!search.value || type.value !== 'all' || stage.value !== 'all' || agent.value !== 'all')
function clearFilters() {
  search.value = ''
  type.value = 'all'
  stage.value = 'all'
  agent.value = 'all'
}

const { data, pending, refresh } = await useFetch<any>('/api/admin/saas/clients', {
  query: computed(() => ({ search: search.value, type: type.value, stage: stage.value, agent: agent.value })),
})
const rows = computed<any[]>(() => data.value?.rows || [])
</script>
