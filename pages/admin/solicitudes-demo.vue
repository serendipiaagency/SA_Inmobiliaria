<template>
  <div class="max-w-6xl">
    <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Solicitudes de demo</h1>
        <p class="mt-1 text-sm text-stone-500">Quien pide una demostración desde la landing de INMO aparece aquí, con lo que escribió y su consentimiento. Son de la plataforma: no crean leads en ninguna empresa.</p>
      </div>
      <div class="flex items-center gap-2">
        <input v-model="search" type="search" class="input w-64" placeholder="Buscar por nombre, correo o inmobiliaria" aria-label="Buscar solicitudes" data-testid="demo-requests-search">
      </div>
    </div>

    <div class="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Estado">
      <button v-for="f in FILTERS" :key="f.value" type="button" role="tab" class="rounded-full border px-3.5 py-1.5 text-sm font-medium transition" :class="status === f.value ? 'border-ink bg-ink text-white' : 'border-line bg-white text-stone-600 hover:border-stone-400'" :aria-selected="status === f.value" :data-testid="`demo-requests-filter-${f.value || 'all'}`" @click="status = f.value">
        {{ f.label }} <span class="ml-1 tabular-nums opacity-70">{{ f.value ? counts[f.value] : total }}</span>
      </button>
    </div>

    <div v-if="pending && !rows.length" class="space-y-3">
      <div v-for="i in 4" :key="i" class="skeleton h-16 rounded-xl border border-line" />
    </div>
    <div v-else-if="!rows.length" class="rounded-xl border border-dashed border-line px-6 py-12 text-center text-sm text-stone-500" data-testid="demo-requests-empty">
      {{ search || status ? 'Ninguna solicitud coincide.' : 'Todavía no hay solicitudes de demo.' }}
    </div>

    <AdminPanel v-else :pad="false">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b border-line bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-400">
            <tr>
              <th class="px-4 py-2.5 font-semibold">Fecha</th>
              <th class="px-4 py-2.5 font-semibold">Quién</th>
              <th class="px-4 py-2.5 font-semibold">Inmobiliaria</th>
              <th class="px-4 py-2.5 font-semibold">Equipo · Interés</th>
              <th class="px-4 py-2.5 font-semibold">Estado</th>
              <th class="px-4 py-2.5 font-semibold"><span class="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="r in rows" :key="r.id">
              <tr class="border-b border-line/60 hover:bg-stone-50" :class="{ 'bg-amber-50/40': r.id === openId }" :data-testid="`demo-request-row-${r.id}`" :data-status="r.status">
                <td class="whitespace-nowrap px-4 py-3 text-xs text-stone-500">{{ dt.dateTime(r.createdAt) }}</td>
                <td class="px-4 py-3">
                  <p class="font-medium text-ink">{{ r.name }}</p>
                  <p class="text-xs text-stone-500"><a :href="`mailto:${r.email}`" class="hover:underline">{{ r.email }}</a><span v-if="r.phone"> · {{ r.phone }}</span></p>
                </td>
                <td class="px-4 py-3">{{ r.company }}</td>
                <td class="px-4 py-3 text-xs text-stone-600">{{ r.teamSizeLabel || '—' }} · {{ r.interestLabel || '—' }}</td>
                <td class="px-4 py-3">
                  <select :value="r.status" class="input h-8 py-0 text-xs" :aria-label="`Estado de la solicitud de ${r.name}`" :data-testid="`demo-request-status-${r.id}`" @change="setStatus(r, ($event.target as HTMLSelectElement).value)">
                    <option v-for="s in STATUSES" :key="s.value" :value="s.value">{{ s.label }}</option>
                  </select>
                </td>
                <td class="whitespace-nowrap px-4 py-3 text-right">
                  <button type="button" class="btn-quiet text-xs" :aria-expanded="r.id === openId" :data-testid="`demo-request-open-${r.id}`" @click="openId = openId === r.id ? null : r.id">{{ openId === r.id ? 'Cerrar' : 'Ver' }}</button>
                </td>
              </tr>
              <tr v-if="r.id === openId" class="border-b border-line/60 bg-stone-50/60">
                <td colspan="6" class="px-4 py-4">
                  <div class="grid gap-4 md:grid-cols-2">
                    <div>
                      <p class="text-[11px] font-semibold uppercase tracking-widest text-stone-400">Mensaje</p>
                      <p class="mt-1 whitespace-pre-line text-sm" :data-testid="`demo-request-message-${r.id}`">{{ r.message || 'Sin mensaje.' }}</p>
                      <p class="mt-3 text-xs text-stone-500">Consentimiento aceptado el {{ dt.dateTime(r.consentAt) }}<span v-if="r.locale"> · idioma {{ r.locale }}</span><span v-if="r.requestId"> · petición {{ r.requestId }}</span></p>
                    </div>
                    <div>
                      <label :for="`notes-${r.id}`" class="text-[11px] font-semibold uppercase tracking-widest text-stone-400">Notas internas</label>
                      <textarea :id="`notes-${r.id}`" v-model="notesDraft" rows="4" class="input mt-1 w-full" :data-testid="`demo-request-notes-${r.id}`" />
                      <div class="mt-2 flex items-center justify-between gap-2">
                        <button type="button" class="btn-primary text-xs" :disabled="saving" :data-testid="`demo-request-save-notes-${r.id}`" @click="saveNotes(r)">Guardar notas</button>
                        <button type="button" class="text-xs font-medium text-red-600 hover:underline" :data-testid="`demo-request-delete-${r.id}`" @click="remove(r)">Borrar solicitud</button>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </AdminPanel>
    <p v-if="error" class="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
/**
 * Sistema → Solicitudes de demo (sólo super admin): la bandeja de quien pide
 * una demostración desde la landing comercial (server/utils/demoRequests.ts).
 * Atender una solicitud es cambiar su estado y apuntar notas; borrarla es
 * para cuando la persona lo pide (RGPD).
 */
definePageMeta({ layout: 'admin', middleware: 'admin' })

interface DemoRequestRow {
  id: number
  name: string
  email: string
  company: string
  phone: string | null
  teamSize: string | null
  interest: string | null
  teamSizeLabel: string | null
  interestLabel: string | null
  message: string | null
  locale: string | null
  consentAt: string
  status: 'new' | 'contacted' | 'closed'
  notes: string | null
  requestId: string | null
  createdAt: string
}

const STATUSES = [
  { value: 'new', label: 'Nueva' },
  { value: 'contacted', label: 'Contactada' },
  { value: 'closed', label: 'Cerrada' },
] as const
const FILTERS = [{ value: '', label: 'Todas' }, ...STATUSES] as const

const dt = useDash()
const route = useRoute()
const status = ref<string>('')
const search = ref('')
const debounced = ref('')
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(search, (v) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => (debounced.value = v.trim()), 250)
})
const openId = ref<number | null>(Number(route.query.id) || null)
const notesDraft = ref('')
const saving = ref(false)
const error = ref('')

const { data, pending, refresh } = await useFetch<{ rows: DemoRequestRow[]; counts: Record<'new' | 'contacted' | 'closed', number> }>('/api/admin/demo-requests', {
  query: computed(() => ({ status: status.value || undefined, q: debounced.value || undefined })),
})
const rows = computed(() => data.value?.rows || [])
const counts = computed(() => data.value?.counts || { new: 0, contacted: 0, closed: 0 })
const total = computed(() => counts.value.new + counts.value.contacted + counts.value.closed)

watch(openId, (id) => {
  notesDraft.value = rows.value.find((r) => r.id === id)?.notes || ''
})
watch(rows, () => {
  if (openId.value && !notesDraft.value) notesDraft.value = rows.value.find((r) => r.id === openId.value)?.notes || ''
})

async function patch(body: Record<string, unknown>) {
  error.value = ''
  saving.value = true
  try {
    await $fetch('/api/admin/demo-requests', { method: 'PATCH', body })
    await refresh()
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.statusMessage || 'No se pudo guardar el cambio.'
  } finally {
    saving.value = false
  }
}
function setStatus(r: DemoRequestRow, value: string) {
  return patch({ id: r.id, status: value })
}
function saveNotes(r: DemoRequestRow) {
  return patch({ id: r.id, notes: notesDraft.value })
}
async function remove(r: DemoRequestRow) {
  if (!confirm(`¿Borrar la solicitud de ${r.name} (${r.email})? No se puede deshacer.`)) return
  await patch({ action: 'delete', ids: [r.id] })
  if (openId.value === r.id) openId.value = null
}
</script>
