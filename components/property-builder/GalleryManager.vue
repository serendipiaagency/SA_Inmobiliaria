<template>
  <div data-testid="gallery-manager">
    <p v-if="!parentId" class="text-sm text-stone-400">Guarda la ficha primero para poder añadir imágenes a la galería.</p>
    <template v-else>
      <!-- Acciones sobre la selección (FASE 7): ocultar, privada, publicable, descargar y eliminar. -->
      <div v-if="rows.length" class="mb-3 flex flex-wrap items-center gap-2 text-[12px]" data-testid="gallery-bulk">
        <label class="flex items-center gap-1.5 text-stone-600">
          <input type="checkbox" :checked="allSelected" :indeterminate.prop="selected.size > 0 && !allSelected" aria-label="Seleccionar todas las fotos" data-testid="gallery-select-all" @change="toggleAll"> Seleccionar todo
        </label>
        <template v-if="selected.size">
          <span class="text-stone-400">{{ selected.size }} {{ selected.size === 1 ? 'foto' : 'fotos' }}:</span>
          <button type="button" class="pe-btn-quiet !py-1" data-testid="gallery-bulk-hide" @click="bulkSet({ isHidden: 1 })">Ocultar</button>
          <button type="button" class="pe-btn-quiet !py-1" @click="bulkSet({ isHidden: 0 })">Mostrar</button>
          <button type="button" class="pe-btn-quiet !py-1" @click="bulkSet({ isPrivate: 1 })">Privadas</button>
          <button type="button" class="pe-btn-quiet !py-1" @click="bulkSet({ isPrivate: 0 })">No privadas</button>
          <button type="button" class="pe-btn-quiet !py-1" @click="bulkSet({ isPublishable: 1 })">Publicables</button>
          <button type="button" class="pe-btn-quiet !py-1" @click="bulkSet({ isPublishable: 0 })">No publicables</button>
          <button type="button" class="pe-btn-quiet !py-1" data-testid="gallery-bulk-download" @click="bulkDownload">Descargar</button>
          <button type="button" class="pe-btn-quiet !py-1 text-red-600" data-testid="gallery-bulk-delete" @click="bulkRemove">Eliminar</button>
        </template>
      </div>

      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        <div
          v-for="(row, i) in rows"
          :key="row.id"
          class="group relative aspect-[4/3] overflow-hidden rounded-lg border bg-stone-50 transition"
          :class="[dragOverIndex === i ? 'border-ink ring-2 ring-ink/30' : selected.has(row.id) ? 'border-ink' : 'border-line', isOut(row) ? 'opacity-60' : '']"
          draggable="true"
          data-testid="gallery-item"
          :data-gallery-id="row.id"
          @dragstart="dragFrom = i"
          @dragover.prevent="dragOverIndex = i"
          @dragleave="dragOverIndex === i && (dragOverIndex = null)"
          @drop="onDrop(i)"
        >
          <img :src="mediaUrl(row.image)" :alt="row.alt || ''" class="h-full w-full object-cover" loading="lazy" :class="dragFrom === i ? 'opacity-40' : ''" >
          <input
            type="checkbox"
            class="absolute right-1.5 top-1.5 h-4 w-4"
            :checked="selected.has(row.id)"
            :aria-label="`Seleccionar la foto ${i + 1}`"
            data-testid="gallery-item-select"
            @change="toggle(row.id)"
          >
          <div class="absolute left-1.5 top-1.5 flex flex-wrap gap-1">
            <span v-if="row.image === coverValue" class="rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold text-white">Portada</span>
            <span v-if="row.isHidden" class="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white" data-testid="gallery-item-hidden">Oculta</span>
            <span v-if="row.isPrivate" class="rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-semibold text-white">Privada</span>
            <span v-if="row.isPublishable === 0" class="rounded-full bg-stone-600 px-2 py-0.5 text-[10px] font-semibold text-white">No publicable</span>
          </div>
          <div class="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
            <button
              v-if="row.image !== coverValue"
              type="button"
              class="rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-ink hover:bg-white"
              @click="$emit('use-as-cover', row.image)"
            >
              Usar como portada
            </button>
            <span v-else class="flex-1" />
            <button type="button" class="rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-ink hover:bg-white" :data-testid="`gallery-item-edit-${row.id}`" @click="openEdit(row)">Datos</button>
            <a :href="mediaUrl(row.image)" download class="rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-ink hover:bg-white" title="Descargar">↓</a>
            <button type="button" class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-600" title="Eliminar" :data-testid="`gallery-item-delete-${row.id}`" @click="remove(row.id)">
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <label class="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-line text-stone-400 transition hover:border-ink hover:text-ink">
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14M5 12h14" /></svg>
          <span class="text-[11px] font-semibold">Añadir imagen</span>
          <input type="file" accept="image/*" class="hidden" multiple @change="add($event)" >
        </label>
      </div>

      <!-- Metadatos de la foto abierta -->
      <div v-if="editing" class="mt-4" data-testid="gallery-item-metadata">
        <div class="mb-2 flex items-center justify-between">
          <p class="text-[13px] font-medium text-ink">Datos de la foto</p>
          <button type="button" class="text-[12px] text-stone-500 hover:text-ink" @click="editing = null">Cerrar</button>
        </div>
        <MediaMetadataForm :model="edit" :error="editError" :saving="savingEdit" @save="saveEdit" />
      </div>

      <p v-if="uploading" class="mt-2 text-[11px] text-stone-400">Subiendo…</p>
      <p v-if="error" class="mt-2 text-[11px] font-medium text-red-600">{{ error }}</p>
      <p v-if="rows.length > 1" class="mt-3 text-[11px] text-stone-400">Arrastra una imagen para reordenar la galería. Las ocultas, privadas o no publicables se ven atenuadas: no salen ni en la web ni en los portales.</p>
    </template>

    <!-- Vídeos, tours, renders, PDF, drone y 360 (FASE 7): justo debajo de las fotos. -->
    <div v-if="kind" class="mt-8 border-t border-line pt-6">
      <h3 class="mb-2 text-[15px] font-medium text-ink">Vídeos, tours, renders, PDF, drone y 360°</h3>
      <PropertyMediaManager :parent-id="parentId" :kind="kind" :can-edit="canEdit" :trashed="trashed" />
    </div>
  </div>
</template>

<script setup lang="ts">
import MediaMetadataForm from '~/components/admin/property/MediaMetadataForm.vue'
import PropertyMediaManager from '~/components/admin/property/PropertyMediaManager.vue'

/**
 * Galería de una propiedad (los dos catálogos) — orden, portada y, desde el
 * bloque N7a (FASE 7), metadatos por foto (título, alt, pie, idioma,
 * publicable, privada, oculta), selección múltiple con ocultar, descargar y
 * eliminar, y debajo el resto de la multimedia (`PropertyMediaManager`).
 * Borrar una foto ya no deja huérfanos su fichero ni su registro: el servidor
 * lo libera si ninguna otra ficha de la agencia lo usa.
 */
const props = withDefaults(defineProps<{ childResource: string; parentField: string; parentId: number | null; coverValue?: string | null; canEdit?: boolean; trashed?: boolean }>(), {
  coverValue: null,
  canEdit: true,
  trashed: false,
})
defineEmits<{ 'use-as-cover': [key: string] }>()
const { confirm } = useConfirm()
const toast = useToast()

/** El catálogo sale del recurso hijo: la galería de obra nueva es `project-images`, la de 2ª mano `gallery-images`. */
const kind = computed<'developer' | 'agent' | null>(() => (props.childResource === 'project-images' ? 'developer' : props.childResource === 'gallery-images' ? 'agent' : null))

const rows = ref<any[]>([])
const uploading = ref(false)
const error = ref('')

function isOut(row: any) {
  return row.isHidden || row.isPrivate || row.isPublishable === 0
}

async function load() {
  if (!props.parentId) {
    rows.value = []
    return
  }
  // Filtrado en el servidor por la propiedad (antes: 100 filas de toda la agencia y filtro en el navegador).
  const res = await $fetch<{ rows: any[] }>(`/api/admin/${props.childResource}`, { query: { perPage: 100, [props.parentField]: props.parentId } })
  rows.value = res.rows
    .filter((r) => r[props.parentField] === props.parentId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id)
  const ids = new Set(rows.value.map((r) => r.id))
  selected.value = new Set([...selected.value].filter((id) => ids.has(id)))
}

async function add(e: Event) {
  const input = e.target as HTMLInputElement
  const files = [...(input.files || [])]
  if (!files.length || !props.parentId) return
  uploading.value = true
  error.value = ''
  try {
    for (const file of files) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', props.childResource)
      const uploaded = await $fetch<{ key: string }>('/api/admin/upload', { method: 'POST', body: fd })
      await $fetch(`/api/admin/${props.childResource}`, {
        method: 'POST',
        body: { [props.parentField]: props.parentId, image: uploaded.key, sortOrder: rows.value.length },
      })
      await load()
    }
  } catch (err: any) {
    error.value = err?.data?.statusMessage || err?.statusMessage || 'No se pudo añadir la imagen'
  } finally {
    uploading.value = false
    input.value = ''
  }
}

async function remove(id: number) {
  const ok = await confirm('Esta imagen se eliminará de la galería. Si ninguna otra ficha la usa, su fichero deja de servirse y se borra del almacenamiento a los 30 días.', { title: '¿Eliminar imagen?', confirmLabel: 'Eliminar', danger: true })
  if (!ok) return
  try {
    await $fetch<{ ok: true }>(`/api/admin/${props.childResource}/${id}`, { method: 'DELETE' })
    rows.value = rows.value.filter((r) => r.id !== id)
    if (editing.value?.id === id) editing.value = null
  } catch {
    toast.error('No se pudo eliminar la imagen')
  }
}

// --- Selección múltiple ------------------------------------------------------
const selected = ref(new Set<number>())
const allSelected = computed(() => rows.value.length > 0 && selected.value.size === rows.value.length)
function toggle(id: number) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}
function toggleAll() {
  selected.value = allSelected.value ? new Set() : new Set(rows.value.map((r) => r.id))
}
async function bulkSet(patch: Record<string, number>) {
  const ids = [...selected.value]
  let failed = 0
  for (const id of ids) {
    try {
      await $fetch(`/api/admin/${props.childResource}/${id}`, { method: 'PUT', body: patch })
    } catch {
      failed++
    }
  }
  if (failed) toast.error(`${failed} de ${ids.length} fotos no se pudieron actualizar`)
  else toast.success(ids.length === 1 ? 'Foto actualizada' : `${ids.length} fotos actualizadas`)
  await load()
}
function bulkDownload() {
  for (const r of rows.value.filter((x) => selected.value.has(x.id))) {
    const a = document.createElement('a')
    a.href = mediaUrl(r.image)
    a.download = ''
    a.click()
  }
}
async function bulkRemove() {
  const ids = [...selected.value]
  const ok = await confirm(`Se eliminarán ${ids.length} ${ids.length === 1 ? 'foto' : 'fotos'} de la galería.`, { title: '¿Eliminar las fotos seleccionadas?', confirmLabel: 'Eliminar', danger: true })
  if (!ok) return
  let failed = 0
  for (const id of ids) {
    try {
      await $fetch<{ ok: true }>(`/api/admin/${props.childResource}/${id}`, { method: 'DELETE' })
    } catch {
      failed++
    }
  }
  if (failed) toast.error(`${failed} fotos no se pudieron eliminar`)
  selected.value = new Set()
  await load()
}

// --- Metadatos de una foto ----------------------------------------------------
const editing = ref<any | null>(null)
const edit = reactive<Record<string, any>>({})
const editError = ref('')
const savingEdit = ref(false)
function openEdit(row: any) {
  editing.value = row
  editError.value = ''
  Object.assign(edit, {
    title: row.title || '',
    alt: row.alt || '',
    caption: row.caption || '',
    language: row.language || '',
    isPublishable: row.isPublishable !== 0,
    isPrivate: !!row.isPrivate,
    isHidden: !!row.isHidden,
  })
}
async function saveEdit() {
  if (!editing.value) return
  savingEdit.value = true
  editError.value = ''
  try {
    await $fetch(`/api/admin/${props.childResource}/${editing.value.id}`, { method: 'PUT', body: { ...edit, language: edit.language || null } })
    editing.value = null
    toast.success('Datos de la foto guardados')
    await load()
  } catch (e: any) {
    editError.value = e?.data?.statusMessage || 'No se pudo guardar'
  } finally {
    savingEdit.value = false
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
