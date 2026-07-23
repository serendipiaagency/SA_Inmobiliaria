<template>
  <div>
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Media Library</h1>
        <p class="mt-1 text-sm text-stone-500">{{ data?.total ?? 0 }} archivo(s){{ selected.length ? ` · ${selected.length} seleccionado(s)` : '' }}</p>
      </div>
      <div class="flex gap-2">
        <input v-model="q" class="input !w-52" placeholder="Buscar por nombre…" @keyup.enter="refresh" />
        <button class="btn-secondary" :class="{ '!bg-ink !text-white': favoriteOnly }" @click="favoriteOnly = !favoriteOnly">★ Favoritos</button>
        <NuxtLink to="/admin/cms/papelera" class="btn-secondary">Papelera</NuxtLink>
        <label class="btn-primary cursor-pointer">
          {{ uploading ? 'Subiendo…' : '+ Subir archivo' }}
          <input type="file" class="hidden" accept="image/*,application/pdf" :disabled="uploading" @change="upload" />
        </label>
      </div>
    </div>

    <div class="mb-4 flex flex-wrap items-center gap-2 text-sm">
      <button class="rounded-full px-3 py-1 font-medium" :class="folderId === 'root' ? 'bg-ink text-white' : 'bg-stone-100 text-stone-500'" @click="folderId = 'root'">Sin carpeta</button>
      <button class="rounded-full px-3 py-1 font-medium" :class="!folderId ? 'bg-ink text-white' : 'bg-stone-100 text-stone-500'" @click="folderId = ''">Todo</button>
      <button v-for="f in folders" :key="f.id" class="rounded-full px-3 py-1 font-medium" :class="folderId === f.id ? 'bg-ink text-white' : 'bg-stone-100 text-stone-500'" @click="folderId = f.id">📁 {{ f.name }}</button>
      <button class="text-xs text-emerald-700 hover:underline" @click="newFolder">+ Carpeta</button>
    </div>

    <!-- Bulk actions bar -->
    <div v-if="selected.length" class="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-stone-50 px-4 py-2.5 text-sm">
      <span class="font-medium">{{ selected.length }} seleccionado(s)</span>
      <select class="input !w-48 !py-1" @change="bulkMove(($event.target as HTMLSelectElement).value)">
        <option value="">Mover a carpeta…</option>
        <option value="null">Sin carpeta</option>
        <option v-for="f in folders" :key="f.id" :value="f.id">{{ f.name }}</option>
      </select>
      <button class="text-red-600 hover:underline" @click="bulkDelete">Eliminar</button>
      <button class="ml-auto text-stone-450 hover:underline" @click="selected = []">Cancelar</button>
    </div>

    <div v-if="data?.rows?.length" class="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
      <div v-for="m in data.rows" :key="m.id" class="group relative overflow-hidden rounded-xl border border-line bg-white" :class="{ 'ring-2 ring-ink': selected.includes(m.id) }">
        <input type="checkbox" class="absolute left-1.5 top-1.5 z-10 h-4 w-4" :checked="selected.includes(m.id)" @change="toggleOne(m.id)" />
        <div class="flex h-28 items-center justify-center bg-stone-50">
          <img v-if="m.type === 'image' || m.type === 'svg'" :src="m.url" class="h-full w-full object-cover" />
          <span v-else class="text-3xl">📄</span>
        </div>
        <div class="p-2">
          <p class="truncate text-[11px] font-medium">{{ m.filename }}</p>
          <p class="text-[10px] text-stone-400">{{ (m.sizeBytes / 1024).toFixed(0) }} KB</p>
        </div>
        <div class="absolute right-1.5 top-1.5 hidden gap-1 group-hover:flex">
          <button class="rounded-full bg-white/90 p-1.5 shadow" :class="m.favorite ? 'text-amber-500' : 'text-stone-400'" title="Favorito" @click="toggleFavorite(m)">★</button>
          <button v-if="m.type === 'image'" class="rounded-full bg-white/90 p-1.5 text-stone-500 shadow" title="Editar" @click="editingImage = m">✎</button>
          <button class="rounded-full bg-white/90 p-1.5 text-red-600 shadow" title="Eliminar" @click="remove(m.id)">✕</button>
        </div>
      </div>
    </div>
    <div v-else class="card py-16 text-center">
      <p class="text-sm font-medium text-slate-500">No hay archivos en esta vista</p>
      <p class="mt-1 text-xs text-slate-400">Sube tu primera imagen o PDF.</p>
    </div>

    <div v-if="totalPages > 1" class="mt-4 flex items-center justify-end gap-3 text-sm">
      <button class="btn-secondary !py-1.5" :disabled="page <= 1" @click="page--">← Anterior</button>
      <span>{{ page }} / {{ totalPages }}</span>
      <button class="btn-secondary !py-1.5" :disabled="page >= totalPages" @click="page++">Siguiente →</button>
    </div>

    <CmsImageEditor v-if="editingImage" :src="editingImage.url" @close="editingImage = null" @saved="onEdited" />
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Media Library — Blog & CMS' })

const q = ref('')
const page = ref(1)
const uploading = ref(false)
const favoriteOnly = ref(false)
const folderId = ref<number | string>('')
const editingImage = ref<any>(null)
const selected = ref<number[]>([])
const toast = useToast()
const { confirm } = useConfirm()

const { data: foldersData, refresh: refreshFolders } = await useFetch<any>('/api/admin/cms-media-folders', { query: { perPage: 100 } })
const folders = computed(() => foldersData.value?.rows || [])

const { data, refresh } = await useFetch<any>('/api/admin/cms/media', {
  query: computed(() => ({ page: page.value, q: q.value, favorite: favoriteOnly.value ? '1' : '', folderId: folderId.value })),
})
const totalPages = computed(() => Math.ceil((data.value?.total || 0) / (data.value?.perPage || 40)))
watch(data, () => (selected.value = []))

function toggleOne(id: number) {
  selected.value = selected.value.includes(id) ? selected.value.filter((x) => x !== id) : [...selected.value, id]
}

async function upload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploading.value = true
  const fd = new FormData()
  fd.append('file', file)
  if (typeof folderId.value === 'number') fd.append('folderId', String(folderId.value))
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
  const ok = await confirm('Se moverá a la Papelera (puedes restaurarlo).', { title: '¿Eliminar este archivo?', confirmLabel: 'Eliminar', danger: true })
  if (!ok) return
  await $fetch(`/api/admin/cms/media/${id}`, { method: 'DELETE' })
  toast.success('Archivo movido a la papelera')
  await refresh()
}

async function bulkDelete() {
  const ok = await confirm(`Se moverán ${selected.value.length} archivo(s) a la Papelera.`, { title: '¿Eliminar selección?', confirmLabel: 'Eliminar', danger: true })
  if (!ok) return
  await Promise.all(selected.value.map((id) => $fetch(`/api/admin/cms/media/${id}`, { method: 'DELETE' })))
  toast.success('Movidos a la papelera')
  selected.value = []
  await refresh()
}

async function bulkMove(value: string) {
  if (!value) return
  const folderIdValue = value === 'null' ? null : Number(value)
  await Promise.all(selected.value.map((id) => $fetch(`/api/admin/cms/media/${id}`, { method: 'PATCH', body: { folderId: folderIdValue } })))
  toast.success('Archivos movidos')
  selected.value = []
  await refresh()
}

async function toggleFavorite(m: any) {
  await $fetch(`/api/admin/cms/media/${m.id}`, { method: 'PATCH', body: { favorite: !m.favorite } })
  await refresh()
}

async function newFolder() {
  const name = window.prompt('Nombre de la carpeta:')
  if (!name?.trim()) return
  await $fetch('/api/admin/cms-media-folders', { method: 'POST', body: { name: name.trim() } })
  await refreshFolders()
}

function onEdited() {
  editingImage.value = null
  refresh()
}
</script>
