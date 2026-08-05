<template>
  <div class="max-w-4xl">
    <div class="mb-6">
      <NuxtLink to="/admin/asset-export/batches" class="text-xs text-stone-500 hover:underline">← Lotes</NuxtLink>
      <h1 class="mt-1 text-2xl font-semibold tracking-tight">{{ batch?.name }}</h1>
    </div>

    <AdminPanel class="mb-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium">{{ batch?.completedCount }} de {{ batch?.totalCount }} piezas generadas</p>
          <p v-if="batch?.failedCount" class="mt-0.5 text-xs text-red-600">{{ batch.failedCount }} con error</p>
        </div>
        <div class="flex gap-3">
          <a v-if="batch?.completedCount" :href="`/api/admin/asset-export/batches/${batchId}/download-zip`" class="text-xs font-medium text-ink hover:underline" target="_blank">
            Descargar todo (ZIP)
          </a>
          <button v-if="isRunning" type="button" class="text-xs font-medium text-stone-500 hover:underline" @click="cancel">Cancelar</button>
          <button v-if="batch?.failedCount" type="button" class="text-xs font-medium text-ink hover:underline" @click="retryFailed">Reintentar errores</button>
        </div>
      </div>
      <div class="mt-3 h-2 overflow-hidden rounded-full bg-stone-100">
        <div class="h-full bg-ink transition-all" :style="{ width: `${progressPct}%` }" />
      </div>
    </AdminPanel>

    <AdminPanel title="Piezas">
      <ul class="divide-y divide-line">
        <li v-for="item in items" :key="item.id" class="flex items-center justify-between py-2.5 text-sm">
          <span>{{ item.assetName || `Activo #${item.assetId}` }}</span>
          <span class="flex items-center gap-3">
            <span class="rounded-full px-2 py-0.5 text-[11px] font-medium" :class="statusClass(item.status)">{{ statusLabel(item.status) }}</span>
            <a v-if="item.status === 'completed' && item.renderId" :href="`/api/admin/asset-export/renders/${item.renderId}/download`" class="text-xs font-medium text-ink hover:underline" target="_blank">
              Descargar
            </a>
            <span v-if="item.status === 'failed'" class="text-xs text-red-600" :title="item.errorMessage || undefined">Error</span>
          </span>
        </li>
      </ul>
    </AdminPanel>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Lote de exportación — Asset Export Studio' })

interface BatchItem {
  id: number
  assetId: number
  assetName: string | null
  status: string
  renderId: number | null
  errorMessage: string | null
}
interface BatchDetail {
  id: number
  name: string
  status: string
  totalCount: number
  completedCount: number
  failedCount: number
  items: BatchItem[]
}

const route = useRoute()
const batchId = String(route.params.id)

const batch = ref<BatchDetail | null>(null)
const items = computed(() => batch.value?.items || [])
const progressPct = computed(() => (batch.value?.totalCount ? Math.round(((batch.value.completedCount + batch.value.failedCount) / batch.value.totalCount) * 100) : 0))
const isRunning = computed(() => batch.value && ['pending', 'running'].includes(batch.value.status))

async function load() {
  batch.value = await $fetch<BatchDetail>(`/api/admin/asset-export/batches/${batchId}`)
}

let cancelled = false
async function processLoop() {
  while (!cancelled) {
    const result = await $fetch<{ done: boolean }>(`/api/admin/asset-export/batches/${batchId}/process-next`, { method: 'POST' })
    await load()
    if (result.done) break
  }
}

async function cancel() {
  cancelled = true
  await $fetch(`/api/admin/asset-export/batches/${batchId}/cancel`, { method: 'POST' })
  await load()
}

async function retryFailed() {
  await $fetch(`/api/admin/asset-export/batches/${batchId}/retry-failed`, { method: 'POST' })
  cancelled = false
  await load()
  await processLoop()
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
