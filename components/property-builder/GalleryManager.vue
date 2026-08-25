<template>
  <div>
    <p v-if="!parentId" class="text-sm text-stone-400">Guarda la ficha primero para poder añadir imágenes a la galería.</p>
    <template v-else>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        <div
          v-for="(row, i) in rows"
          :key="row.id"
          class="group relative aspect-[4/3] overflow-hidden rounded-lg border bg-stone-50 transition"
          :class="dragOverIndex === i ? 'border-ink ring-2 ring-ink/30' : 'border-line'"
          draggable="true"
          @dragstart="dragFrom = i"
          @dragover.prevent="dragOverIndex = i"
          @dragleave="dragOverIndex === i && (dragOverIndex = null)"
          @drop="onDrop(i)"
        >
          <img :src="mediaUrl(row.image)" class="h-full w-full object-cover" loading="lazy" :class="dragFrom === i ? 'opacity-40' : ''" />
          <span v-if="row.image === coverValue" class="absolute left-1.5 top-1.5 rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold text-white">Portada</span>
          <div class="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 transition group-hover:opacity-100">
            <button
              v-if="row.image !== coverValue"
              type="button"
              class="rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-ink hover:bg-white"
              @click="$emit('use-as-cover', row.image)"
            >
              Usar como portada
            </button>
            <span v-else class="flex-1" />
            <button type="button" class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-600" title="Eliminar" @click="remove(row.id)">
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <label class="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-line text-stone-400 transition hover:border-ink hover:text-ink">
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14M5 12h14" /></svg>
          <span class="text-[11px] font-semibold">Añadir imagen</span>
          <input type="file" accept="image/*" class="hidden" @change="add($event)" />
        </label>
      </div>
      <p v-if="uploading" class="mt-2 text-[11px] text-stone-400">Subiendo…</p>
      <p v-if="error" class="mt-2 text-[11px] font-medium text-red-600">{{ error }}</p>
      <p v-if="rows.length > 1" class="mt-3 text-[11px] text-stone-400">Arrastra una imagen para reordenar la galería.</p>
    </template>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ childResource: string; parentField: string; parentId: number | null; coverValue?: string | null }>()
defineEmits<{ 'use-as-cover': [key: string] }>()
const { confirm } = useConfirm()
const toast = useToast()

const rows = ref<any[]>([])
const uploading = ref(false)
const error = ref('')

async function load() {
  if (!props.parentId) {
    rows.value = []
    return
  }
  const res = await $fetch<{ rows: any[] }>(`/api/admin/${props.childResource}`, { query: { perPage: 100 } })
  rows.value = res.rows
    .filter((r) => r[props.parentField] === props.parentId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id)
}

async function add(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !props.parentId) return
  uploading.value = true
  error.value = ''
  try {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('folder', props.childResource)
    const uploaded = await $fetch<{ key: string }>('/api/admin/upload', { method: 'POST', body: fd })
    await $fetch(`/api/admin/${props.childResource}`, {
      method: 'POST',
      body: { [props.parentField]: props.parentId, image: uploaded.key, sortOrder: rows.value.length },
    })
    await load()
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.statusMessage || 'No se pudo añadir la imagen'
  } finally {
    uploading.value = false
    input.value = ''
  }
}

async function remove(id: number) {
  const ok = await confirm('Esta imagen se eliminará de la galería.', { title: '¿Eliminar imagen?', confirmLabel: 'Eliminar', danger: true })
  if (!ok) return
  try {
    await $fetch<{ ok: true }>(`/api/admin/${props.childResource}/${id}`, { method: 'DELETE' })
    rows.value = rows.value.filter((r) => r.id !== id)
  } catch {
    toast.error('No se pudo eliminar la imagen')
  }
}

const dragFrom = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

async function onDrop(to: number) {
  const from = dragFrom.value
  dragFrom.value = null
  dragOverIndex.value = null
  if (from === null || from === to) return

  const [moved] = rows.value.splice(from, 1)
  rows.value.splice(to, 0, moved)

  // Persist the new order immediately — a save() on the parent form only
  // covers `form`'s own columns, gallery rows always persist on their own
  // as soon as they change (same as add/remove above).
  const updates = rows.value.map((r, i) => ({ r, sortOrder: i })).filter(({ r, sortOrder }) => r.sortOrder !== sortOrder)
  try {
    await Promise.all(
      updates.map(({ r, sortOrder }) => {
        r.sortOrder = sortOrder
        return $fetch(`/api/admin/${props.childResource}/${r.id}`, { method: 'PUT', body: { sortOrder } })
      }),
    )
  } catch {
    toast.error('No se pudo guardar el nuevo orden')
    await load()
  }
}

watch(() => props.parentId, load, { immediate: true })
</script>
