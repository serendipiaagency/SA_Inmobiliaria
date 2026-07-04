<template>
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">Visitas</h1>
      <p class="mt-1 text-sm text-stone-500">Agenda de visitas a propiedades</p>
    </div>

    <div class="mb-4 flex flex-wrap gap-1.5">
      <button v-for="f in filters" :key="f.key" class="rounded-lg border px-3 py-1.5 text-xs font-medium transition" :class="status === f.key ? 'border-ink bg-ink text-white' : 'border-line bg-white text-stone-600 hover:border-stone-300'" @click="status = f.key">
        {{ f.label }} <span class="ml-1 opacity-60">{{ f.key === 'all' ? totalCount : (counts[f.key] || 0) }}</span>
      </button>
    </div>

    <AdminPanel :pad="false">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b border-line bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-400">
            <tr>
              <th class="px-4 py-2.5 font-semibold">Cliente</th>
              <th class="px-4 py-2.5 font-semibold">Propiedad</th>
              <th class="px-4 py-2.5 font-semibold">Agente</th>
              <th class="px-4 py-2.5 font-semibold">Canal</th>
              <th class="px-4 py-2.5 font-semibold">Fecha</th>
              <th class="px-4 py-2.5 font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="v in rows" :key="v.id" class="border-b border-line/60 last:border-0 hover:bg-stone-50">
              <td class="px-4 py-3 font-medium">{{ v.clientName }}</td>
              <td class="px-4 py-3 text-stone-600">{{ v.propertyName }}</td>
              <td class="px-4 py-3 text-stone-600">{{ v.agentName }}</td>
              <td class="px-4 py-3">
                <span class="inline-flex items-center gap-1.5 text-stone-600">
                  <svg class="h-3.5 w-3.5 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path :d="channelIcon(v.channel)" /></svg>
                  {{ channelLabel(v.channel) }}
                </span>
              </td>
              <td class="px-4 py-3 text-stone-600">{{ dt.dateTime(v.scheduledAt) }}</td>
              <td class="px-4 py-3"><AdminStatusPill :status="v.status" /></td>
            </tr>
            <tr v-if="!rows.length"><td colspan="6" class="px-4 py-10 text-center text-stone-400">Sin visitas</td></tr>
          </tbody>
        </table>
      </div>
    </AdminPanel>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Visitas — M&M Real Estate' })
const dt = useDash()

const status = ref('all')
const { data } = await useFetch<any>('/api/admin/saas/visits', { query: { status } })
const rows = computed<any[]>(() => data.value?.rows || [])
const counts = ref<Record<string, number>>({})
watch(data, (d) => { if (d?.counts) counts.value = d.counts }, { immediate: true })
const totalCount = computed(() => Object.values(counts.value).reduce((a, b) => a + b, 0))

const filters = [
  { key: 'all', label: 'Todas' },
  { key: 'scheduled', label: 'Agendadas' },
  { key: 'completed', label: 'Completadas' },
  { key: 'cancelled', label: 'Canceladas' },
  { key: 'no_show', label: 'No asistió' },
]
function channelLabel(c: string) {
  return { in_person: 'Presencial', video: 'Videollamada', phone: 'Teléfono' }[c] || c
}
function channelIcon(c: string) {
  if (c === 'video') return 'M23 7l-7 5 7 5V7zM1 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H1V5z'
  if (c === 'phone') return 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z'
  return 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8'
}
</script>
