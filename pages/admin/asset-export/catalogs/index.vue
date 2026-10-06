<template>
  <div class="max-w-4xl">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Catálogos combinados</h1>
        <p class="mt-1 text-sm text-stone-500">Genera un único PDF con portada, índice y una sección por activo — a diferencia de la exportación masiva, que crea un documento por activo.</p>
      </div>
      <button type="button" class="dash-btn-primary" @click="showCreate = true">Nuevo catálogo</button>
    </div>

    <div v-if="showCreate" class="mb-6">
      <AdminPanel title="Nuevo catálogo">
        <label class="mb-4 block">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Nombre del catálogo (opcional)</span>
          <input v-model="form.name" class="cfg-input" placeholder="Ej. Selección Marbella verano 2026" >
        </label>
        <label class="mb-4 block">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Título de portada (opcional)</span>
          <input v-model="form.coverTitle" class="cfg-input" placeholder="Se usa el nombre del catálogo si se deja vacío" >
        </label>
        <label class="mb-4 block">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Plantilla</span>
          <select v-model="form.templateId" class="cfg-input">
            <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </label>

        <!-- FASE 28: un catálogo es de obra nueva o de 2ª mano, nunca mezcla los dos. -->
        <div class="mb-4">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Propiedades de</span>
          <div class="inline-flex rounded-lg border border-line p-0.5 text-[13px]" role="radiogroup" data-testid="catalog-kind">
            <button
              v-for="k in KINDS"
              :key="k.value"
              type="button"
              role="radio"
              :aria-checked="form.propertyKind === k.value"
              class="rounded-md px-3 py-1.5 font-medium transition"
              :class="form.propertyKind === k.value ? 'bg-ink text-white' : 'text-stone-600 hover:text-ink'"
              :data-testid="`catalog-kind-${k.value}`"
              @click="setKind(k.value)"
            >
              {{ k.label }}
            </button>
          </div>
          <p v-if="form.propertyKind === 'agent'" class="mt-1.5 text-[11px] text-stone-500">Sólo datos y fotos publicables, con la ubicación según la privacidad de cada ficha; sin QR, porque la 2ª mano no tiene página pública.</p>
        </div>

        <label class="mb-2 block">
          <span class="mb-1.5 block text-[12px] font-medium text-stone-600">Buscar activos</span>
          <input v-model="query" class="cfg-input" :placeholder="form.propertyKind === 'agent' ? 'Referencia, calle o zona…' : 'Nombre de la propiedad…'" data-testid="catalog-asset-search" @input="search" >
        </label>
        <ul v-if="results.length" class="mb-3 max-h-40 divide-y divide-line overflow-y-auto rounded-lg border border-line">
          <li v-for="r in results" :key="r.id" class="flex items-center justify-between px-3 py-2 text-sm">
            <span>{{ assetLabel(r) }}</span>
            <button type="button" class="text-xs font-medium text-ink hover:underline" @click="addAsset(r)">Añadir</button>
          </li>
        </ul>

        <div v-if="selected.length" class="mb-2 flex flex-wrap gap-2">
          <span v-for="s in selected" :key="s.id" class="flex items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-1 text-xs">
            {{ s.name }}
            <button type="button" class="text-stone-400 hover:text-red-600" @click="removeAsset(s.id)">✕</button>
          </span>
        </div>
        <p class="mb-4 text-[11px] text-stone-500">{{ selected.length }} / {{ MAX_ASSETS }} activos (el ensamblado final se hace en una sola petición, por eso el límite es menor que en la exportación masiva).</p>

        <div class="flex items-center gap-3">
          <button type="button" class="dash-btn-primary" :disabled="!selected.length || creating" @click="create">
            {{ creating ? 'Creando…' : `Crear catálogo (${selected.length} activos)` }}
          </button>
          <button type="button" class="text-sm text-stone-500 hover:underline" @click="showCreate = false">Cancelar</button>
        </div>
        <p v-if="error" class="mt-2 text-sm font-medium text-red-600">{{ error }}</p>
      </AdminPanel>
    </div>

    <div v-if="!catalogs.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-stone-500">
      Todavía no se ha creado ningún catálogo combinado.
    </div>
    <div v-else class="space-y-3">
      <NuxtLink v-for="c in catalogs" :key="c.id" :to="`/admin/asset-export/catalogs/${c.id}`" class="block">
        <AdminPanel>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-semibold">{{ c.name }} <span class="ml-1 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-600" :data-testid="`catalog-${c.id}-kind`">{{ KIND_LABEL[c.propertyKind || 'developer'] }}</span></p>
              <p class="mt-1 text-xs text-stone-500">{{ c.completedCount }} de {{ c.totalCount }} secciones generadas{{ c.failedCount ? ` · ${c.failedCount} con error` : '' }}</p>
            </div>
            <span class="rounded-full px-2 py-0.5 text-[11px] font-medium" :class="statusClass(c.status)">{{ statusLabel(c.status) }}</span>
          </div>
        </AdminPanel>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Catálogos combinados — Asset Export Studio' })

interface Template {
  id: number
  name: string
  status: string
  formatKey: string
}
interface Catalog {
  id: number
  name: string
  status: string
  totalCount: number
  completedCount: number
  failedCount: number
  propertyKind?: 'developer' | 'agent'
}
type Kind = 'developer' | 'agent'
const KINDS: { value: Kind; label: string }[] = [
  { value: 'developer', label: 'Obra nueva' },
  { value: 'agent', label: '2ª mano' },
]
const KIND_LABEL: Record<Kind, string> = { developer: 'Obra nueva', agent: '2ª mano' }

const MAX_ASSETS = 30
const RENDER_READY_FORMATS = ['pdf_a4_portrait', 'pdf_a4_landscape', 'pdf_a5_portrait', 'pdf_dossier', 'print_a3_portrait']

const { data: catalogsData } = await useFetch<Catalog[]>('/api/admin/asset-export/catalogs')
const catalogs = computed(() => catalogsData.value || [])

const { data: templatesData } = await useFetch<Template[]>('/api/admin/asset-export/templates')
const templates = computed(() => (templatesData.value || []).filter((t) => t.status === 'published' && RENDER_READY_FORMATS.includes(t.formatKey)))

const showCreate = ref(false)
const form = reactive<{ name: string; coverTitle: string; templateId: number | null; propertyKind: Kind }>({ name: '', coverTitle: '', templateId: null, propertyKind: 'developer' })
watch(templates, (t) => { if (t.length && !form.templateId) form.templateId = t[0].id }, { immediate: true })

const query = ref('')
const results = ref<any[]>([])
let searchTimer: any = null
function search() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(async () => {
    if (!query.value.trim()) return (results.value = [])
    const r = await $fetch<any>(form.propertyKind === 'agent' ? '/api/admin/properties' : '/api/admin/developer-properties', { query: { q: query.value, perPage: 8 } })
    results.value = r.rows
  }, 250)
}

/** Cambiar de catálogo vacía la selección: un catálogo combinado nunca mezcla obra nueva y 2ª mano. */
function setKind(kind: Kind) {
  if (form.propertyKind === kind) return
  form.propertyKind = kind
  selected.splice(0, selected.length)
  results.value = []
  query.value = ''
}

/** Cómo se reconoce cada resultado: el nombre en obra nueva; en 2ª mano, referencia y dirección (es el panel: aquí sí). */
function assetLabel(r: any): string {
  if (form.propertyKind === 'developer') return r.name || `Activo #${r.id}`
  return [r.reference || `Ref. #${r.id}`, r.street || r.location || r.city].filter(Boolean).join(' · ')
}

const selected = reactive<Array<{ id: number; name: string }>>([])
function addAsset(r: any) {
  if (selected.length >= MAX_ASSETS) return
  if (!selected.find((s) => s.id === r.id)) selected.push({ id: r.id, name: assetLabel(r) })
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
    const catalog = await $fetch<Catalog>('/api/admin/asset-export/catalogs', {
      method: 'POST',
      body: { name: form.name || undefined, coverTitle: form.coverTitle || undefined, templateId: form.templateId, assetIds: selected.map((s) => s.id), propertyKind: form.propertyKind },
    })
    await navigateTo(`/admin/asset-export/catalogs/${catalog.id}`)
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.statusMessage || 'Error al crear el catálogo'
  } finally {
    creating.value = false
  }
}

function statusLabel(s: string) {
  return { pending: 'Pendiente', running: 'Generando', completed: 'Completado', completed_with_errors: 'Completado con errores', cancelled: 'Cancelado', failed: 'Error' }[s] || s
}
function statusClass(s: string) {
  return (
    {
      pending: 'bg-stone-100 text-stone-600',
      running: 'bg-sky-100 text-sky-700',
      completed: 'bg-emerald-100 text-emerald-700',
      completed_with_errors: 'bg-amber-100 text-amber-800',
      cancelled: 'bg-stone-200 text-stone-500',
      failed: 'bg-red-100 text-red-700',
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
