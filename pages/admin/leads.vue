<template>
  <div>
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Leads</h1>
        <p class="mt-1 text-sm text-stone-500">{{ total }} leads · arrastra una tarjeta para cambiar su estado</p>
      </div>
      <div class="flex items-center gap-2">
        <div class="flex gap-1 rounded-lg bg-stone-100 p-0.5">
          <button class="rounded-md px-3 py-1.5 text-xs font-medium transition" :class="view === 'board' ? 'bg-white text-ink shadow-sm' : 'text-stone-500'" @click="view = 'board'">Pipeline</button>
          <button class="rounded-md px-3 py-1.5 text-xs font-medium transition" :class="view === 'table' ? 'bg-white text-ink shadow-sm' : 'text-stone-500'" @click="view = 'table'">Tabla</button>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <div class="relative">
        <svg class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
        <input v-model="search" type="search" placeholder="Buscar por nombre, email o propiedad…" class="w-64 rounded-lg border border-line bg-white py-2 pl-9 pr-3 text-sm focus:border-ink" />
      </div>
      <select v-model="source" class="rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink">
        <option value="all">Todos los orígenes</option>
        <option v-for="s in sources" :key="s" :value="s">{{ s }}</option>
      </select>
    </div>

    <!-- Board -->
    <div v-if="view === 'board'" class="flex gap-3 overflow-x-auto pb-2">
      <div
        v-for="col in columns"
        :key="col.key"
        class="flex w-72 shrink-0 flex-col rounded-xl border border-line bg-[#f7f6f4]"
        @dragover.prevent
        @drop="onDrop(col.key)"
      >
        <div class="flex items-center justify-between border-b border-line px-3.5 py-2.5">
          <span class="flex items-center gap-2 text-sm font-semibold">
            <span class="h-2 w-2 rounded-full" :style="{ background: col.dot }" />
            {{ col.label }}
          </span>
          <span class="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-stone-500">{{ (counts[col.key] || 0) }}</span>
        </div>
        <div class="flex-1 space-y-2 overflow-y-auto p-2.5" style="max-height: 62vh">
          <article
            v-for="l in byStatus(col.key)"
            :key="l.id"
            draggable="true"
            class="group cursor-grab rounded-lg border border-line bg-white p-3 shadow-sm transition hover:shadow-md active:cursor-grabbing"
            :class="dragId === l.id ? 'opacity-40' : ''"
            @dragstart="dragId = l.id"
            @dragend="dragId = null"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold">{{ l.name }}</p>
                <p class="truncate text-xs text-stone-500">{{ l.propertyName }}</p>
              </div>
              <span class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold" :class="scoreCls(l.score)">{{ l.score }}</span>
            </div>
            <div class="mt-2 flex items-center justify-between text-xs text-stone-400">
              <span class="capitalize">{{ l.source }}</span>
              <span>{{ dt.money(l.budget, { compact: true }) }}</span>
            </div>
            <div class="mt-2 flex items-center gap-1.5 border-t border-line pt-2 text-[11px] text-stone-500">
              <span class="flex h-5 w-5 items-center justify-center rounded-full bg-stone-100 text-[9px] font-semibold text-stone-600">{{ dt.initials(l.agentName) }}</span>
              <span class="truncate">{{ l.agentName }}</span>
            </div>
          </article>
          <p v-if="!byStatus(col.key).length" class="py-6 text-center text-xs text-stone-400">Vacío</p>
        </div>
      </div>
    </div>

    <!-- Table -->
    <AdminPanel v-else :pad="false">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b border-line bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-400">
            <tr>
              <th class="px-4 py-2.5 font-semibold">Lead</th>
              <th class="px-4 py-2.5 font-semibold">Origen</th>
              <th class="px-4 py-2.5 font-semibold">Estado</th>
              <th class="px-4 py-2.5 text-right font-semibold">Score</th>
              <th class="px-4 py-2.5 text-right font-semibold">Presupuesto</th>
              <th class="px-4 py-2.5 font-semibold">Agente</th>
              <th class="px-4 py-2.5 font-semibold">Últ. contacto</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in rows" :key="l.id" class="border-b border-line/60 last:border-0 hover:bg-stone-50">
              <td class="px-4 py-3">
                <p class="font-medium">{{ l.name }}</p>
                <p class="text-xs text-stone-400">{{ l.email }}</p>
              </td>
              <td class="px-4 py-3 capitalize text-stone-600">{{ l.source }}</td>
              <td class="px-4 py-3"><AdminStatusPill :status="l.status" /></td>
              <td class="px-4 py-3 text-right"><span class="rounded px-1.5 py-0.5 text-xs font-semibold" :class="scoreCls(l.score)">{{ l.score }}</span></td>
              <td class="px-4 py-3 text-right tabular-nums">{{ dt.money(l.budget, { compact: true }) }}</td>
              <td class="px-4 py-3 text-stone-600">{{ l.agentName }}</td>
              <td class="px-4 py-3 text-stone-500">{{ dt.relative(l.lastContactAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </AdminPanel>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Leads — M&M Real Estate' })
const dt = useDash()
const toast = useToast()

const view = ref<'board' | 'table'>('board')
const search = ref('')
const source = ref('all')
const sources = ['web', 'portal', 'referral', 'ads', 'social', 'call']

const { data, refresh } = await useFetch<any>('/api/admin/saas/leads', {
  query: { search, source },
})
const rows = computed<any[]>(() => data.value?.rows || [])
const counts = ref<Record<string, number>>({})
watch(data, (d) => { if (d?.counts) counts.value = { ...d.counts } }, { immediate: true })
const total = computed(() => Object.values(counts.value).reduce((a, b) => a + b, 0))

const columns = [
  { key: 'new', label: 'Nuevos', dot: '#2563eb' },
  { key: 'contacted', label: 'Contactados', dot: '#7c3aed' },
  { key: 'qualified', label: 'Cualificados', dot: '#d97706' },
  { key: 'proposal', label: 'Propuesta', dot: '#ea580c' },
  { key: 'won', label: 'Ganados', dot: '#059669' },
  { key: 'lost', label: 'Perdidos', dot: '#a8a29e' },
]
function byStatus(status: string) {
  return rows.value.filter((l) => l.status === status)
}
function scoreCls(s: number) {
  if (s >= 75) return 'bg-emerald-50 text-emerald-700'
  if (s >= 45) return 'bg-amber-50 text-amber-700'
  return 'bg-stone-100 text-stone-500'
}

const dragId = ref<number | null>(null)
async function onDrop(status: string) {
  const id = dragId.value
  dragId.value = null
  if (!id) return
  const lead = rows.value.find((l) => l.id === id)
  if (!lead || lead.status === status) return
  const old = lead.status
  // optimistic
  counts.value[old] = Math.max(0, (counts.value[old] || 1) - 1)
  counts.value[status] = (counts.value[status] || 0) + 1
  lead.status = status
  try {
    await $fetch(`/api/admin/saas/leads/${id}`, { method: 'PATCH', body: { status } })
  } catch {
    lead.status = old
    counts.value[status] = Math.max(0, (counts.value[status] || 1) - 1)
    counts.value[old] = (counts.value[old] || 0) + 1
    toast.error('No se pudo actualizar el lead')
    refresh()
  }
}
</script>
