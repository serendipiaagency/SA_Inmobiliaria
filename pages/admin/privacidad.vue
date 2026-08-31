<template>
  <div class="max-w-3xl">
    <div class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">Privacidad (RGPD)</h1>
      <p class="mt-1 text-sm text-stone-500">Exportación y anonimización de datos personales a petición del interesado, con registro de auditoría real.</p>
    </div>

    <AdminPanel title="Buscar por email" class="mb-6">
      <div class="flex gap-3">
        <input v-model="email" type="email" placeholder="cliente@ejemplo.com" class="cfg-input flex-1" >
        <button type="button" class="dash-btn-primary" :disabled="!!loading" @click="doExport">{{ loading === 'export' ? 'Exportando…' : 'Exportar datos' }}</button>
        <button type="button" class="rounded-lg border border-red-200 px-4 py-2 text-[13px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50" :disabled="!!loading" @click="confirmDelete">
          {{ loading === 'delete' ? 'Anonimizando…' : 'Anonimizar / eliminar' }}
        </button>
      </div>
      <p v-if="error" class="mt-2 text-sm font-medium text-red-600">{{ error }}</p>

      <div v-if="exportResult" class="mt-4 rounded-lg bg-stone-50 p-4">
        <p class="text-sm font-medium">{{ exportResult.rowsAffected }} registros encontrados para {{ exportResult.email }}</p>
        <div class="mt-2 flex flex-wrap gap-2 text-xs text-stone-500">
          <span v-for="(rows, table) in exportResult.data" :key="table">{{ table }}: {{ rows.length }}</span>
        </div>
        <button type="button" class="mt-3 text-xs font-medium text-ink hover:underline" @click="downloadJson">Descargar JSON completo</button>
      </div>

      <div v-if="deleteResult" class="mt-4 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
        Anonimizados {{ deleteResult.rowsAffected }} registros: {{ Object.entries(deleteResult.affected).map(([k, v]) => `${k}: ${v}`).join(', ') }}
      </div>
    </AdminPanel>

    <AdminPanel title="Historial de solicitudes">
      <ul v-if="requests.length" class="divide-y divide-line text-sm">
        <li v-for="r in requests" :key="r.id" class="flex items-center justify-between py-2">
          <span>{{ r.requestType === 'export' ? 'Exportación' : 'Eliminación' }} — {{ r.subjectEmail }}</span>
          <span class="text-xs text-stone-400">{{ r.rowsAffected }} filas · {{ dt.relative(r.createdAt) }}</span>
        </li>
      </ul>
      <p v-else class="text-sm text-stone-400">Sin solicitudes registradas todavía.</p>
    </AdminPanel>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Privacidad (RGPD) — M&M Real Estate' })
const dt = useDash()

const email = ref('')
const loading = ref<'export' | 'delete' | null>(null)
const error = ref('')
const exportResult = ref<any>(null)
const deleteResult = ref<any>(null)

const { data: requestsData, refresh: refreshRequests } = await useFetch<any[]>('/api/admin/saas/gdpr/requests')
const requests = computed(() => requestsData.value || [])

async function doExport() {
  if (!email.value) return
  error.value = ''
  loading.value = 'export'
  deleteResult.value = null
  try {
    exportResult.value = await $fetch('/api/admin/saas/gdpr/export', { method: 'POST', body: { email: email.value } })
    await refreshRequests()
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'Error al exportar'
  } finally {
    loading.value = null
  }
}

async function confirmDelete() {
  if (!email.value) return
  if (!confirm(`¿Anonimizar todos los datos personales de ${email.value}? Esta acción sustituye nombre/email/teléfono por un marcador y no se puede deshacer.`)) return
  error.value = ''
  loading.value = 'delete'
  exportResult.value = null
  try {
    deleteResult.value = await $fetch('/api/admin/saas/gdpr/delete', { method: 'POST', body: { email: email.value } })
    await refreshRequests()
  } catch (err: any) {
    error.value = err?.data?.statusMessage || 'Error al anonimizar'
  } finally {
    loading.value = null
  }
}

function downloadJson() {
  if (!exportResult.value) return
  const blob = new Blob([JSON.stringify(exportResult.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `rgpd-export-${exportResult.value.email}.json`
  a.click()
  URL.revokeObjectURL(url)
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
