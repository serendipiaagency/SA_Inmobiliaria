<template>
  <div class="max-w-5xl" data-testid="newsletter-admin">
    <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Suscriptores del newsletter</h1>
        <p class="mt-1 max-w-2xl text-sm text-stone-500">
          Quien se apunta en «Suscríbete», en el pie de tu web, con la política de privacidad aceptada. No se les envía nada automáticamente: esto es tu lista,
          lista para exportar.
        </p>
      </div>
      <a :href="csvUrl" class="dash-btn-secondary" data-testid="newsletter-export" download>Exportar CSV</a>
    </div>

    <div class="mb-4 grid gap-3 sm:grid-cols-3">
      <button
        v-for="s in STATUS_TABS"
        :key="s.key"
        type="button"
        class="rounded-xl border px-4 py-3 text-left transition"
        :class="status === s.key ? 'border-ink bg-white' : 'border-line bg-white/60 hover:border-stone-400'"
        :data-testid="`newsletter-filter-${s.key || 'all'}`"
        @click="setStatus(s.key)"
      >
        <p class="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{{ s.label }}</p>
        <p class="mt-1 text-xl font-semibold tabular-nums" :data-testid="`newsletter-count-${s.key || 'all'}`">{{ s.key ? data?.counts[s.key] ?? 0 : totalAll }}</p>
      </button>
    </div>

    <AdminPanel>
      <div class="mb-3 flex items-center gap-3">
        <input v-model="q" type="search" placeholder="Buscar por email…" class="cfg-input max-w-xs" data-testid="newsletter-search" >
        <span class="text-xs text-stone-400">{{ data?.total ?? 0 }} resultados</span>
      </div>
      <div v-if="pending && !data" class="py-10 text-center text-sm text-stone-400">Cargando…</div>
      <div v-else-if="!data?.items.length" class="py-10 text-center text-sm text-stone-500" data-testid="newsletter-empty">
        {{ q || status ? 'Nadie coincide con el filtro.' : 'Aún no se ha suscrito nadie. El formulario está en el pie de tu web (Constructor Web → pie → Suscríbete).' }}
      </div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-line text-left text-[11px] uppercase tracking-wide text-stone-500">
              <th class="py-2 pr-3 font-semibold">Email</th>
              <th class="py-2 pr-3 font-semibold">Estado</th>
              <th class="py-2 pr-3 font-semibold">Alta</th>
              <th class="py-2 pr-3 font-semibold">Idioma</th>
              <th class="py-2 font-semibold" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in data.items" :key="row.id" class="border-b border-line last:border-0" :data-testid="`newsletter-row-${row.id}`" :data-email="row.email" :data-status="row.status">
              <td class="py-2.5 pr-3 font-medium">{{ row.email }}</td>
              <td class="py-2.5 pr-3">
                <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="STATUS_CLASS[row.status]">{{ STATUS_LABEL[row.status] }}</span>
                <span v-if="row.unsubscribedAt" class="ml-1 text-xs text-stone-400">{{ dt.date(row.unsubscribedAt) }}</span>
              </td>
              <td class="py-2.5 pr-3 text-stone-500" :title="`Consentimiento: ${dt.dateTime(row.consentAt)}`">{{ dt.date(row.createdAt) }}</td>
              <td class="py-2.5 pr-3 uppercase text-stone-500">{{ row.locale || '—' }}</td>
              <td class="py-2.5 text-right">
                <button v-if="row.status !== 'unsubscribed'" type="button" class="text-xs font-semibold text-stone-600 hover:text-ink" data-testid="newsletter-unsubscribe" @click="unsubscribe(row)">Dar de baja</button>
                <button type="button" class="ml-3 text-xs font-semibold text-rose-600 hover:text-rose-700" data-testid="newsletter-delete" @click="remove(row)">Eliminar</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="(data?.total ?? 0) > PAGE" class="mt-4 flex items-center justify-between text-xs text-stone-500">
        <button type="button" class="dash-btn-secondary" :disabled="offset === 0" @click="offset = Math.max(0, offset - PAGE)">Anteriores</button>
        <span>{{ offset + 1 }}–{{ Math.min(offset + PAGE, data?.total ?? 0) }} de {{ data?.total }}</span>
        <button type="button" class="dash-btn-secondary" :disabled="offset + PAGE >= (data?.total ?? 0)" @click="offset += PAGE">Siguientes</button>
      </div>
    </AdminPanel>
  </div>
</template>

<script setup lang="ts">
/**
 * Portal Web → Suscriptores: la lista del «Suscríbete» del pie de la web
 * (server/utils/newsletter.ts). Se puede filtrar, exportar, dar de baja a
 * quien lo pida por otra vía y borrar (supresión RGPD). No se puede apuntar a
 * nadie desde aquí: el alta exige su consentimiento, en la web.
 */
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Suscriptores del newsletter' })

type Status = 'subscribed' | 'pending' | 'unsubscribed'
interface Row {
  id: number
  email: string
  status: Status
  source: string
  locale: string | null
  consentAt: string
  confirmedAt: string | null
  unsubscribedAt: string | null
  createdAt: string
}
interface ListResponse {
  items: Row[]
  total: number
  counts: Record<Status, number>
}

const STATUS_TABS: { key: Status | ''; label: string }[] = [
  { key: '', label: 'Todos' },
  { key: 'subscribed', label: 'Suscritos' },
  { key: 'unsubscribed', label: 'Bajas' },
]
const STATUS_LABEL: Record<Status, string> = { subscribed: 'Suscrito', pending: 'Pendiente', unsubscribed: 'Baja' }
const STATUS_CLASS: Record<Status, string> = { subscribed: 'bg-emerald-50 text-emerald-700', pending: 'bg-amber-50 text-amber-700', unsubscribed: 'bg-stone-100 text-stone-500' }
const PAGE = 50

const dt = useDash()
const toast = useToast()
const { confirm } = useConfirm()
const status = ref<Status | ''>('')
const q = ref('')
const debouncedQ = ref('')
const offset = ref(0)
let qTimer: ReturnType<typeof setTimeout> | null = null
watch(q, (v) => {
  if (qTimer) clearTimeout(qTimer)
  qTimer = setTimeout(() => {
    debouncedQ.value = v.trim()
    offset.value = 0
  }, 300)
})
function setStatus(s: Status | '') {
  status.value = s
  offset.value = 0
}

const query = computed(() => ({ status: status.value || undefined, q: debouncedQ.value || undefined, limit: PAGE, offset: offset.value }))
const { data, pending, refresh } = await useFetch<ListResponse>('/api/admin/newsletter', { query })
const totalAll = computed(() => (data.value ? data.value.counts.subscribed + data.value.counts.pending + data.value.counts.unsubscribed : 0))
const csvUrl = computed(() => {
  const p = new URLSearchParams({ format: 'csv' })
  if (status.value) p.set('status', status.value)
  if (debouncedQ.value) p.set('q', debouncedQ.value)
  return `/api/admin/newsletter?${p}`
})

async function unsubscribe(row: Row) {
  if (!(await confirm(`${row.email} dejará de estar en tu lista de suscriptores.`, { title: '¿Dar de baja?', confirmLabel: 'Dar de baja' }))) return
  try {
    await $fetch('/api/admin/newsletter', { method: 'PATCH', body: { id: row.id, action: 'unsubscribe' } })
    toast.success('Dado de baja')
    await refresh()
  } catch {
    toast.error('No se pudo dar de baja')
  }
}

async function remove(row: Row) {
  if (!(await confirm(`Se borra ${row.email} y la fecha de su consentimiento. No se puede deshacer.`, { title: '¿Eliminar suscriptor?', confirmLabel: 'Eliminar', danger: true }))) return
  try {
    await $fetch('/api/admin/newsletter', { method: 'PATCH', body: { id: row.id, action: 'delete' } })
    toast.success('Suscriptor eliminado')
    await refresh()
  } catch {
    toast.error('No se pudo eliminar')
  }
}
</script>

<style scoped>
.dash-btn-secondary {
  @apply inline-flex items-center rounded-lg border border-line bg-white px-4 py-2 text-[13px] font-medium text-ink transition hover:bg-stone-50 disabled:opacity-50;
}
.cfg-input {
  @apply w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-ink;
}
</style>
