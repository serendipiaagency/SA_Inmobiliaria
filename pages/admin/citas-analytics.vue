<template>
  <div>
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Analítica de citas</h1>
        <p class="mt-1 text-sm text-stone-500">Uso real de la agenda: no-show, ocupación por agente y conversión a venta</p>
      </div>
      <select v-model.number="days" class="input !w-40">
        <option :value="7">Últimos 7 días</option>
        <option :value="30">Últimos 30 días</option>
        <option :value="90">Últimos 90 días</option>
      </select>
    </div>

    <div class="mb-6 grid gap-4 sm:grid-cols-4">
      <AdminStatCard label="Agendadas" :value="String(totals.scheduled ?? 0)" />
      <AdminStatCard label="Completadas" :value="String(totals.completed ?? 0)" />
      <AdminStatCard label="Tasa de no-show" :value="pct(totals.noShowRate)" sub="de las citas que ya deberían haber ocurrido" />
      <AdminStatCard label="Conversión cita → venta" :value="pct(totals.conversionRate)" :sub="`${totals.convertedCount ?? 0} de ${totals.consideredForConversion ?? 0} citas completadas con email`" />
    </div>

    <AdminPanel title="Ocupación por agente" sub="Citas reservadas ÷ capacidad teórica según su horario semanal y sus bloqueos, en el periodo seleccionado">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b border-line text-left text-[11px] uppercase tracking-wide text-stone-400">
            <tr>
              <th class="py-2 font-semibold">Agente</th>
              <th class="py-2 font-semibold">Citas</th>
              <th class="py-2 font-semibold">Capacidad</th>
              <th class="py-2 font-semibold">Ocupación</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in perAgent" :key="a.agentId" class="border-b border-line/60 last:border-0">
              <td class="py-2.5 font-medium">
                <NuxtLink :to="`/admin/team/${a.agentId}`" class="hover:underline">{{ a.name }}</NuxtLink>
              </td>
              <td class="py-2.5 text-stone-600">{{ a.bookedCount }}</td>
              <td class="py-2.5 text-stone-600">{{ a.capacitySlots }}</td>
              <td class="py-2.5">
                <span v-if="a.occupancy == null" class="text-stone-400">Sin horario configurado</span>
                <span v-else class="font-medium">{{ pct(a.occupancy) }}</span>
              </td>
            </tr>
            <tr v-if="!perAgent.length"><td colspan="4" class="py-10 text-center text-stone-400">Sin agentes</td></tr>
          </tbody>
        </table>
      </div>
    </AdminPanel>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Analítica de citas — M&M Real Estate' })

const days = ref(30)
const { data } = await useFetch<any>('/api/admin/saas/appointments-analytics', { query: { days } })
const totals = computed(() => data.value?.totals || {})
const perAgent = computed<any[]>(() => data.value?.perAgent || [])

function pct(v: number | null | undefined) {
  return v == null ? '—' : `${Math.round(v * 100)}%`
}
</script>
