<template>
  <div class="max-w-4xl">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Exportación masiva</h1>
        <p class="mt-1 text-sm text-stone-500">Genera un PDF por activo para varios activos a la vez, con una sola plantilla.</p>
      </div>
      <button type="button" class="dash-btn-primary" @click="showCreate = true">Nuevo lote</button>
    </div>

    <div v-if="showCreate" class="mb-6">
      <AdminPanel title="Nuevo lote">
        <label class="mb-4 block">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Nombre del lote (opcional)</span>
          <input v-model="form.name" class="cfg-input" />
        </label>
        <label class="mb-4 block">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Plantilla</span>
          <select v-model="form.templateId" class="cfg-input">
            <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </label>

        <label class="mb-2 block">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Buscar activos</span>
          <input v-model="query" class="cfg-input" placeholder="Nombre de la propiedad…" @input="search" />
        </label>
        <ul v-if="results.length" class="mb-3 max-h-40 divide-y divide-line overflow-y-auto rounded-lg border border-line">
          <li v-for="r in results" :key="r.id" class="flex items-center justify-between px-3 py-2 text-sm">
            <span>{{ r.name }}</span>
            <button type="button" class="text-xs font-medium text-ink hover:underline" @click="addAsset(r)">Añadir</button>
          </li>
        </ul>

        <div v-if="selected.length" class="mb-4 flex flex-wrap gap-2">
          <span v-for="s in selected" :key="s.id" class="flex items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-1 text-xs">
            {{ s.name }}
            <button type="button" class="text-stone-400 hover:text-red-600" @click="removeAsset(s.id)">✕</button>
          </span>
        </div>

        <div class="flex items-center gap-3">
          <button type="button" class="dash-btn-primary" :disabled="!selected.length || creating" @click="create">
            {{ creating ? 'Creando…' : `Crear lote (${selected.length} activos)` }}
          </button>
          <button type="button" class="text-sm text-stone-500 hover:underline" @click="showCreate = false">Cancelar</button>
        </div>
        <p v-if="error" class="mt-2 text-sm font-medium text-red-600">{{ error }}</p>
      </AdminPanel>
    </div>

    <div v-if="!batches.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">
      Todavía no se ha creado ningún lote de exportación.
    </div>
    <div v-else class="space-y-3">
      <NuxtLink v-for="b in batches" :key="b.id" :to="`/admin/asset-export/batches/${b.id}`" class="block">
        <AdminPanel>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-semibold">{{ b.name }}</p>
              <p class="mt-1 text-xs text-stone-500">{{ b.completedCount }} de {{ b.totalCount }} piezas generadas{{ b.failedCount ? ` · ${b.failedCount} con error` : '' }}</p>
            </div>
            <span class="rounded-full px-2 py-0.5 text-[11px] font-medium" :class="statusClass(b.status)">{{ statusLabel(b.status) }}</span>
          </div>
        </AdminPanel>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Exportación masiva — Asset Export Studio' })

interface Template {
  id: number
  name: string
  status: string
  formatKey: string
}
interface Batch {
  id: number
  name: string
  status: string
  totalCount: number
  completedCount: number
  failedCount: number
}

const RENDER_READY_FORMATS = ['pdf_a4_portrait', 'pdf_a4_landscape', 'pdf_a5_portrait', 'pdf_dossier', 'print_a3_portrait']

const { data: batchesData } = await useFetch<Batch[]>('/api/admin/asset-export/batches')
const batches = computed(() => batchesData.value || [])

const { data: templatesData } = await useFetch<Template[]>('/api/admin/asset-export/templates')
const templates = computed(() => (templatesData.value || []).filter((t) => t.status === 'published' && RENDER_READY_FORMATS.includes(t.formatKey)))

const showCreate = ref(false)
const form = reactive<{ name: string; templateId: number | null }>({ name: '', templateId: null })
watch(templates, (t) => { if (t.length && !form.templateId) form.templateId = t[0].id }, { immediate: true })

const query = ref('')
const results = ref<any[]>([])
let searchTimer: any = null
function search() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(async () => {
    if (!query.value.trim()) return (results.value = [])
    const r = await $fetch<any>('/api/admin/developer-properties', { query: { q: query.value, perPage: 8 } })
    results.value = r.rows
  }, 250)
}

const selected = reactive<Array<{ id: number; name: string }>>([])
function addAsset(r: any) {
  if (!selected.find((s) => s.id === r.id)) selected.push({ id: r.id, name: r.name })
}
function removeAsset(id: number) {
  const idx = selected.findIndex((s) => s.id === id)
  if (idx >= 0) selected.splice(idx, 1)
}

const creating = ref(false)
const error = ref('')
async function create() {
  if (!form.templateId) return
  creating.value = true
  error.value = ''
  try {
    const batch = await $fetch<Batch>('/api/admin/asset-export/batches', {
      method: 'POST',
      body: { name: form.name || undefined, templateId: form.templateId, assetIds: selected.map((s) => s.id) },
    })
    await navigateTo(`/admin/asset-export/batches/${batch.id}`)
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.statusMessage || 'Error al crear el lote'
  } finally {
    creating.value = false
  }
}

function statusLabel(s: string) {
  return { pending: 'Pendiente', running: 'Generando', completed: 'Completado', completed_with_errors: 'Completado con errores', cancelled: 'Cancelado' }[s] || s
}
function statusClass(s: string) {
  return (
    {
      pending: 'bg-stone-100 text-stone-600',
      running: 'bg-sky-100 text-sky-700',
      completed: 'bg-emerald-100 text-emerald-700',
      completed_with_errors: 'bg-amber-100 text-amber-800',
      cancelled: 'bg-stone-200 text-stone-500',
    }[s] || 'bg-stone-100 text-stone-600'
  )
}
</script>

<style scoped>
.cfg-input {
  @apply w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink;
}
.dash-btn-primary {
  @apply inline-flex items-center rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white transition hover:bg-black disabled:opacity-50;
}
</style>
