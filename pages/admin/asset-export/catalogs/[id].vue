<template>
  <div class="max-w-4xl">
    <div class="mb-6">
      <NuxtLink to="/admin/asset-export/catalogs" class="text-xs text-stone-500 hover:underline">← Catálogos</NuxtLink>
      <h1 class="mt-1 text-2xl font-semibold tracking-tight">{{ catalog?.name }}</h1>
    </div>

    <AdminPanel class="mb-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium">{{ statusHeadline }}</p>
          <p v-if="catalog?.failedCount" class="mt-0.5 text-xs text-red-600">{{ catalog.failedCount }} activo(s) no se pudieron generar y quedarán fuera del catálogo</p>
          <p v-if="catalog?.errorMessage" class="mt-0.5 text-xs text-red-600">{{ catalog.errorMessage }}</p>
        </div>
        <div class="flex items-center gap-3">
          <a v-if="isDownloadable" :href="`/api/admin/asset-export/catalogs/${catalogId}/download`" class="text-xs font-medium text-ink hover:underline" target="_blank">Descargar PDF</a>
          <button v-if="isRunning" type="button" class="text-xs font-medium text-stone-500 hover:underline" @click="cancel">Cancelar</button>
        </div>
      </div>
      <div class="mt-3 h-2 overflow-hidden rounded-full bg-stone-100">
        <div class="h-full bg-ink transition-all" :style="{ width: `${progressPct}%` }" />
      </div>
    </AdminPanel>

    <AdminPanel title="Secciones del catálogo">
      <ul class="divide-y divide-line">
        <li v-for="item in items" :key="item.id" class="flex items-center justify-between py-2.5 text-sm">
          <span>{{ item.assetName || `Activo #${item.assetId}` }}</span>
          <span class="flex items-center gap-3">
            <span v-if="item.status === 'completed' && item.pageCount" class="text-xs text-stone-500">{{ item.pageCount }} pág.</span>
            <span class="rounded-full px-2 py-0.5 text-[11px] font-medium" :class="statusClass(item.status)">{{ statusLabel(item.status) }}</span>
            <span v-if="item.status === 'failed'" class="text-xs text-red-600" :title="item.errorMessage || undefined">Error</span>
          </span>
        </li>
      </ul>
    </AdminPanel>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Catálogo combinado — Asset Export Studio' })

interface CatalogItem {
  id: number
  assetId: number
  assetName: string | null
  status: string
  pageCount: number | null
  errorMessage: string | null
}
interface CatalogDetail {
  id: number
  name: string
  status: string
  totalCount: number
  completedCount: number
  failedCount: number
  errorMessage: string | null
  items: CatalogItem[]
}

const route = useRoute()
const catalogId = String(route.params.id)

const catalog = ref<CatalogDetail | null>(null)
const items = computed(() => catalog.value?.items || [])
const progressPct = computed(() => (catalog.value?.totalCount ? Math.round(((catalog.value.completedCount + catalog.value.failedCount) / catalog.value.totalCount) * 100) : 0))
const isRunning = computed(() => catalog.value && ['pending', 'running'].includes(catalog.value.status))
const isDownloadable = computed(() => catalog.value && ['completed', 'completed_with_errors'].includes(catalog.value.status))
const statusHeadline = computed(() => {
  if (!catalog.value) return ''
  if (catalog.value.status === 'completed' || catalog.value.status === 'completed_with_errors') return 'Catálogo generado'
  if (catalog.value.status === 'failed') return 'No se pudo generar el catálogo'
  if (catalog.value.status === 'cancelled') return 'Cancelado'
  return `${catalog.value.completedCount + catalog.value.failedCount} de ${catalog.value.totalCount} secciones procesadas`
})

async function load() {
  catalog.value = await $fetch<CatalogDetail>(`/api/admin/asset-export/catalogs/${catalogId}`)
}

let cancelled = false
async function processLoop() {
  while (!cancelled) {
    const result = await $fetch<{ done: boolean }>(`/api/admin/asset-export/catalogs/${catalogId}/process-next`, { method: 'POST' })
    await load()
    if (result.done) break
  }
}

async function cancel() {
  cancelled = true
  await $fetch(`/api/admin/asset-export/catalogs/${catalogId}/cancel`, { method: 'POST' })
  await load()
}

onMounted(async () => {
  await load()
  if (isRunning.value) await processLoop()
})
onBeforeUnmount(() => {
  cancelled = true
})

function statusLabel(s: string) {
  return { pending: 'Pendiente', rendering: 'Generando…', completed: 'Completado', failed: 'Error', cancelled: 'Cancelado' }[s] || s
}
function statusClass(s: string) {
  return (
    {
      pending: 'bg-stone-100 text-stone-600',
      rendering: 'bg-sky-100 text-sky-700',
      completed: 'bg-emerald-100 text-emerald-700',
      failed: 'bg-red-100 text-red-700',
      cancelled: 'bg-stone-200 text-stone-500',
    }[s] || 'bg-stone-100 text-stone-600'
  )
}
</script>
