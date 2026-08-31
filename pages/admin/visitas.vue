<template>
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">Visitas</h1>
      <p class="mt-1 text-sm text-stone-500">Agenda de visitas y citas con agentes</p>
    </div>

    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap gap-1.5">
        <button v-for="f in filters" :key="f.key" class="rounded-lg border px-3 py-1.5 text-xs font-medium transition" :class="status === f.key ? 'border-ink bg-ink text-white' : 'border-line bg-white text-stone-600 hover:border-stone-300'" @click="status = f.key">
          {{ f.label }} <span class="ml-1 opacity-60">{{ f.key === 'all' ? totalCount : (counts[f.key] || 0) }}</span>
        </button>
      </div>
      <div class="flex gap-1 rounded-lg border border-line p-0.5">
        <button class="rounded-md px-3 py-1 text-xs font-medium transition" :class="view === 'list' ? 'bg-ink text-white' : 'text-stone-500'" @click="view = 'list'">Lista</button>
        <button class="rounded-md px-3 py-1 text-xs font-medium transition" :class="view === 'calendar' ? 'bg-ink text-white' : 'text-stone-500'" @click="view = 'calendar'">Calendario</button>
      </div>
    </div>

    <div v-if="view === 'calendar'">
      <div class="mb-3 flex items-center gap-3">
        <button class="btn-quiet !px-3 !py-1.5" @click="shiftMonth(-1)">← Mes anterior</button>
        <span class="font-semibold">{{ monthLabel }}</span>
        <button class="btn-quiet !px-3 !py-1.5" @click="shiftMonth(1)">Mes siguiente →</button>
      </div>
      <div class="grid grid-cols-7 gap-1.5 text-xs">
        <div v-for="d in weekdayLabels" :key="d" class="pb-1 text-center font-semibold uppercase text-stone-400">{{ d }}</div>
        <div v-for="(cell, i) in calendarCells" :key="i" class="min-h-[84px] rounded-lg border border-line p-1.5" :class="cell.inMonth ? 'bg-white' : 'bg-stone-50 text-stone-300'">
          <div class="mb-1 text-right font-medium">{{ cell.day }}</div>
          <div class="space-y-0.5">
            <button
              v-for="v in cell.visits.slice(0, 3)"
              :key="v.id"
              class="block w-full truncate rounded px-1 py-0.5 text-left text-[10px]"
              :class="visitDotClass(v.status)"
              :title="`${v.clientName} · ${v.agentName || ''} · ${v.status}`"
              @click="openReschedule(v)"
            >
              {{ v.scheduledAt.slice(11, 16) }} {{ v.clientName }}
            </button>
            <div v-if="cell.visits.length > 3" class="text-[10px] text-stone-400">+{{ cell.visits.length - 3 }} más</div>
          </div>
        </div>
      </div>
    </div>

    <AdminPanel v-else :pad="false">
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
              <th class="px-4 py-2.5 font-semibold"/>
            </tr>
          </thead>
          <tbody>
            <tr v-for="v in rows" :key="v.id" class="border-b border-line/60 last:border-0 hover:bg-stone-50">
              <td class="px-4 py-3 font-medium">{{ v.clientName }}</td>
              <td class="px-4 py-3 text-stone-600">{{ v.propertyName || '—' }}</td>
              <td class="px-4 py-3 text-stone-600">
                <NuxtLink v-if="v.agentId" :to="`/admin/team/${v.agentId}`" class="hover:underline">{{ v.agentName }}</NuxtLink>
                <span v-else>{{ v.agentName || '—' }}</span>
              </td>
              <td class="px-4 py-3">
                <span class="inline-flex items-center gap-1.5 text-stone-600">
                  <svg class="h-3.5 w-3.5 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path :d="channelIcon(v.channel)" /></svg>
                  {{ channelLabel(v.channel) }}
                </span>
              </td>
              <td class="px-4 py-3 text-stone-600">{{ dt.dateTime(v.scheduledAt) }}</td>
              <td class="px-4 py-3"><AdminStatusPill :status="v.status" /></td>
              <td class="px-4 py-3 text-right">
                <div class="flex justify-end gap-1.5">
                  <button v-if="v.status === 'scheduled'" class="btn-quiet !px-2.5 !py-1 text-xs" @click="openReschedule(v)">Reprogramar</button>
                  <button v-if="v.status === 'scheduled'" class="btn-quiet !px-2.5 !py-1 text-xs" :disabled="busyId === v.id" @click="setStatus(v, 'completed')">Completada</button>
                  <button v-if="v.status === 'scheduled'" class="btn-quiet !px-2.5 !py-1 text-xs" :disabled="busyId === v.id" @click="setStatus(v, 'no_show')">No asistió</button>
                  <button v-if="v.status === 'scheduled'" class="btn-quiet !px-2.5 !py-1 text-xs text-red-600" :disabled="busyId === v.id" @click="setStatus(v, 'cancelled')">Cancelar</button>
                </div>
              </td>
            </tr>
            <tr v-if="!rows.length"><td colspan="7" class="px-4 py-10 text-center text-stone-400">Sin visitas</td></tr>
          </tbody>
        </table>
      </div>
    </AdminPanel>

    <div v-if="reschedule" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="reschedule = null">
      <div class="w-full max-w-sm rounded-xl bg-white p-6">
        <h2 class="mb-4 text-lg font-semibold">Reprogramar visita</h2>
        <p class="mb-3 text-sm text-stone-500">{{ reschedule.clientName }}{{ reschedule.agentName ? ` — ${reschedule.agentName}` : '' }}</p>
        <label class="label">Nueva fecha/hora</label>
        <input v-model="rescheduleAt" type="datetime-local" class="input mb-4" >
        <div class="flex justify-end gap-2">
          <button class="btn-secondary" @click="reschedule = null">Cancelar</button>
          <button class="btn-primary" :disabled="!rescheduleAt || busyId === reschedule.id" @click="confirmReschedule">Guardar</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Visitas — M&M Real Estate' })
const dt = useDash()
const toast = useToast()

const status = ref('all')
const { data, refresh } = await useFetch<any>('/api/admin/saas/visits', { query: { status } })
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
const view = ref<'list' | 'calendar'>('list')
const calendarMonth = ref(new Date())
const weekdayLabels = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const monthLabel = computed(() => calendarMonth.value.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }))
function shiftMonth(delta: number) {
  calendarMonth.value = new Date(calendarMonth.value.getFullYear(), calendarMonth.value.getMonth() + delta, 1)
}
const calendarCells = computed(() => {
  const y = calendarMonth.value.getFullYear()
  const m = calendarMonth.value.getMonth()
  const firstDay = new Date(y, m, 1)
  const startOffset = (firstDay.getDay() + 6) % 7 // Monday-first grid
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const cells: { day: number; inMonth: boolean; date: string; visits: any[] }[] = []
  for (let i = 0; i < startOffset; i++) cells.push({ day: 0, inMonth: false, date: '', visits: [] })
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({ day: d, inMonth: true, date: dateStr, visits: rows.value.filter((v) => v.scheduledAt.slice(0, 10) === dateStr) })
  }
  return cells
})
function visitDotClass(status: string) {
  return (
    {
      scheduled: 'bg-blue-50 text-blue-700',
      completed: 'bg-emerald-50 text-emerald-700',
      cancelled: 'bg-stone-100 text-stone-400',
      no_show: 'bg-red-50 text-red-700',
    }[status] || 'bg-stone-100 text-stone-500'
  )
}
function channelLabel(c: string) {
  return { in_person: 'Presencial', video: 'Videollamada', phone: 'Teléfono' }[c] || c
}
function channelIcon(c: string) {
  if (c === 'video') return 'M23 7l-7 5 7 5V7zM1 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H1V5z'
  if (c === 'phone') return 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z'
  return 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8'
}

const busyId = ref<number | null>(null)
async function setStatus(v: any, next: string) {
  busyId.value = v.id
  try {
    await $fetch(`/api/admin/saas/visits/${v.id}`, { method: 'PATCH', body: { status: next } })
    await refresh()
    toast.success('Visita actualizada')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo actualizar la visita')
  } finally {
    busyId.value = null
  }
}

const reschedule = ref<any>(null)
const rescheduleAt = ref('')
function openReschedule(v: any) {
  reschedule.value = v
  rescheduleAt.value = v.scheduledAt.slice(0, 16).replace(' ', 'T')
}
async function confirmReschedule() {
  if (!reschedule.value) return
  busyId.value = reschedule.value.id
  try {
    await $fetch(`/api/admin/saas/visits/${reschedule.value.id}`, { method: 'PATCH', body: { scheduledAt: `${rescheduleAt.value.replace('T', ' ')}:00` } })
    reschedule.value = null
    await refresh()
    toast.success('Visita reprogramada')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo reprogramar')
  } finally {
    busyId.value = null
  }
}
</script>
