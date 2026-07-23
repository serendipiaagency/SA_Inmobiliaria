<template>
  <div>
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Media Library</h1>
        <p class="mt-1 text-sm text-stone-500">{{ data?.total ?? 0 }} archivo(s) · imágenes, PDF y SVG</p>
      </div>
      <div class="flex gap-2">
        <input v-model="q" class="input !w-56" placeholder="Buscar por nombre…" @keyup.enter="refresh" />
        <label class="btn-primary cursor-pointer">
          {{ uploading ? 'Subiendo…' : '+ Subir archivo' }}
          <input type="file" class="hidden" accept="image/*,application/pdf" :disabled="uploading" @change="upload" />
        </label>
      </div>
    </div>

    <div v-if="data?.rows?.length" class="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
      <div v-for="m in data.rows" :key="m.id" class="group relative overflow-hidden rounded-xl border border-line bg-white">
        <div class="flex h-28 items-center justify-center bg-stone-50">
          <img v-if="m.type === 'image' || m.type === 'svg'" :src="m.url" class="h-full w-full object-cover" />
          <span v-else class="text-3xl">📄</span>
        </div>
        <div class="p-2">
          <p class="truncate text-[11px] font-medium">{{ m.filename }}</p>
          <p class="text-[10px] text-stone-400">{{ (m.sizeBytes / 1024).toFixed(0) }} KB</p>
        </div>
        <button
          class="absolute right-1.5 top-1.5 hidden rounded-full bg-white/90 p-1.5 text-red-600 shadow group-hover:block"
          title="Eliminar"
          @click="remove(m.id)"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M6 18L18 6" stroke-linecap="round" /></svg>
        </button>
      </div>
    </div>
    <div v-else class="card py-16 text-center">
      <p class="text-sm font-medium text-slate-500">La biblioteca está vacía</p>
      <p class="mt-1 text-xs text-slate-400">Sube tu primera imagen o PDF.</p>
    </div>

    <div v-if="totalPages > 1" class="mt-4 flex items-center justify-end gap-3 text-sm">
      <button class="btn-secondary !py-1.5" :disabled="page <= 1" @click="page--">← Anterior</button>
      <span>{{ page }} / {{ totalPages }}</span>
      <button class="btn-secondary !py-1.5" :disabled="page >= totalPages" @click="page++">Siguiente →</button>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Media Library — Blog & CMS' })

const q = ref('')
const page = ref(1)
const uploading = ref(false)
const toast = useToast()
const { confirm } = useConfirm()

const { data, refresh } = await useFetch<any>('/api/admin/cms/media', { query: computed(() => ({ page: page.value, q: q.value })) })
const totalPages = computed(() => Math.ceil((data.value?.total || 0) / (data.value?.perPage || 40)))

async function upload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploading.value = true
  const fd = new FormData()
  fd.append('file', file)
  try {
    await $fetch('/api/admin/cms/media', { method: 'POST', body: fd })
    toast.success('Archivo subido')
    await refresh()
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || 'No se pudo subir el archivo')
  } finally {
    uploading.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}

async function remove(id: number) {
  const ok = await confirm('Esto no se puede deshacer.', { title: '¿Eliminar este archivo?', confirmLabel: 'Eliminar', danger: true })
  if (!ok) return
  await $fetch(`/api/admin/cms/media/${id}`, { method: 'DELETE' })
  toast.success('Archivo eliminado')
  await refresh()
}
</script>
