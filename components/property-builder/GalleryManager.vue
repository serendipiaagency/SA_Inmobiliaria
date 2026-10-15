<template>
  <div data-testid="gallery-manager">
    <p v-if="!parentId" class="text-sm text-stone-400">Guarda la ficha primero para poder añadir imágenes a la galería.</p>
    <template v-else>
      <!-- Acciones sobre la selección (FASE 7 y Cola 5): ocultar, privada, publicable, estancia en bloque, miniaturas, descargar y eliminar. -->
      <div v-if="rows.length" class="mb-3 flex flex-wrap items-center gap-2 text-[12px]" data-testid="gallery-bulk">
        <label class="flex items-center gap-1.5 text-stone-600">
          <input type="checkbox" :checked="allSelected" :indeterminate.prop="selected.size > 0 && !allSelected" aria-label="Seleccionar todas las fotos" data-testid="gallery-select-all" @change="toggleAll"> Seleccionar todo
        </label>
        <template v-if="selected.size">
          <span class="text-stone-400">{{ selected.size }} {{ selected.size === 1 ? 'foto' : 'fotos' }}:</span>
          <label class="flex items-center gap-1 text-stone-600">
            <span>Estancia</span>
            <select v-model="bulkRoom" class="rounded-md border border-line bg-white px-1.5 py-1 text-[12px]" aria-label="Estancia para las fotos seleccionadas" data-testid="gallery-bulk-room">
              <option value="">Sin clasificar</option>
              <option v-for="r in MEDIA_ROOMS" :key="r" :value="r">{{ MEDIA_ROOM_LABELS[r] }}</option>
            </select>
            <button type="button" class="pe-btn-quiet !py-1" data-testid="gallery-bulk-room-apply" @click="bulkSet({ room: bulkRoom || null })">Asignar</button>
          </label>
          <button type="button" class="pe-btn-quiet !py-1" data-testid="gallery-bulk-hide" @click="bulkSet({ isHidden: 1 })">Ocultar</button>
          <button type="button" class="pe-btn-quiet !py-1" @click="bulkSet({ isHidden: 0 })">Mostrar</button>
          <button type="button" class="pe-btn-quiet !py-1" @click="bulkSet({ isPrivate: 1 })">Privadas</button>
          <button type="button" class="pe-btn-quiet !py-1" @click="bulkSet({ isPrivate: 0 })">No privadas</button>
          <button type="button" class="pe-btn-quiet !py-1" @click="bulkSet({ isPublishable: 1 })">Publicables</button>
          <button type="button" class="pe-btn-quiet !py-1" @click="bulkSet({ isPublishable: 0 })">No publicables</button>
          <button type="button" class="pe-btn-quiet !py-1" :disabled="thumbing" data-testid="gallery-bulk-thumbs" @click="bulkThumbnails">{{ thumbing ? 'Generando…' : 'Generar miniaturas' }}</button>
          <button type="button" class="pe-btn-quiet !py-1" data-testid="gallery-bulk-download" @click="bulkDownload">Descargar</button>
          <button type="button" class="pe-btn-quiet !py-1 text-red-600" data-testid="gallery-bulk-delete" @click="bulkRemove">Eliminar</button>
        </template>
      </div>

      <!-- Zona de subida: varias a la vez, arrastrando o eligiendo; la estancia elegida aquí se aplica a las nuevas. -->
      <div
        v-if="canEdit && !trashed"
        class="mb-3 rounded-xl border-2 border-dashed px-4 py-4 text-center transition"
        :class="dragging ? 'border-ink bg-stone-50' : 'border-line'"
        data-testid="gallery-dropzone"
        @dragenter.prevent="dragging = true"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
      >
        <p class="text-[13px] text-stone-600">Arrastra aquí las fotos (JPG, PNG, WebP o GIF, hasta 10 MB cada una) o</p>
        <div class="mt-2 flex flex-wrap items-center justify-center gap-2 text-[12px]">
          <label class="pe-btn-dark cursor-pointer !py-1.5">
            Elegir fotos
            <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="hidden" multiple data-testid="gallery-file-input" @change="onPick">
          </label>
          <label class="flex items-center gap-1 text-stone-600">
            <span>Estancia de las nuevas</span>
            <select v-model="newRoom" class="rounded-md border border-line bg-white px-1.5 py-1" aria-label="Estancia para las fotos nuevas" data-testid="gallery-new-room">
              <option value="">Sin clasificar</option>
              <option v-for="r in MEDIA_ROOMS" :key="r" :value="r">{{ MEDIA_ROOM_LABELS[r] }}</option>
            </select>
          </label>
        </div>
        <!-- Cola: estado de cada archivo (en cola, subiendo, hecho, error) con su vista previa. -->
        <ul v-if="queue.length" class="mt-3 grid grid-cols-3 gap-2 text-left sm:grid-cols-5 md:grid-cols-6" data-testid="gallery-queue">
          <li v-for="q in queue" :key="q.id" class="relative overflow-hidden rounded-lg border border-line bg-white" :data-status="q.status" data-testid="gallery-queue-item">
            <div class="aspect-[4/3] bg-stone-100"><img v-if="q.preview" :src="q.preview" alt="" class="h-full w-full object-cover" :class="{ 'opacity-50': q.status !== 'done' }"></div>
            <p class="truncate px-1.5 py-1 text-[10px] text-stone-500" :title="q.name">{{ q.name }}</p>
            <span class="absolute left-1 top-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" :class="q.status === 'error' ? 'bg-red-600 text-white' : q.status === 'done' ? 'bg-emerald-600 text-white' : 'bg-black/60 text-white'">
              {{ q.status === 'queued' ? 'En cola' : q.status === 'uploading' ? 'Subiendo…' : q.status === 'done' ? 'Hecha' : 'Error' }}
            </span>
            <p v-if="q.error" class="px-1.5 pb-1 text-[10px] leading-snug text-red-600" data-testid="gallery-queue-error">{{ q.error }}</p>
          </li>
        </ul>
        <button v-if="queue.length && !uploading" type="button" class="mt-2 text-[11px] text-stone-500 underline" @click="queue = []">Limpiar la lista</button>
      </div>

      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        <div
          v-for="(row, i) in rows"
          :key="row.id"
          class="group relative overflow-hidden rounded-lg border bg-stone-50 transition"
          :class="[dragOverIndex === i ? 'border-ink ring-2 ring-ink/30' : selected.has(row.id) ? 'border-ink' : 'border-line', isOut(row) ? 'opacity-60' : '']"
          draggable="true"
          data-testid="gallery-item"
          :data-gallery-id="row.id"
          :data-room="row.room || ''"
          @dragstart="dragFrom = i"
          @dragover.prevent="dragOverIndex = i"
          @dragleave="dragOverIndex === i && (dragOverIndex = null)"
          @drop="onReorderDrop(i)"
        >
          <div class="aspect-[4/3] bg-stone-100">
            <img :src="mediaUrl(row.thumbKey || row.image)" :alt="row.alt || ''" class="h-full w-full object-cover" loading="lazy" :class="dragFrom === i ? 'opacity-40' : ''" >
          </div>
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
          <!-- Estancia de la foto: se guarda al momento. -->
          <div class="flex items-center gap-1 border-t border-line bg-white px-1.5 py-1">
            <select :value="row.room || ''" class="min-w-0 flex-1 rounded-md border border-line bg-white px-1 py-0.5 text-[11px]" :aria-label="`Estancia de la foto ${i + 1}`" data-testid="gallery-item-room" :disabled="!canEdit" @change="setRoom(row, ($event.target as HTMLSelectElement).value)">
              <option value="">Sin clasificar</option>
              <option v-for="r in MEDIA_ROOMS" :key="r" :value="r">{{ MEDIA_ROOM_LABELS[r] }}</option>
            </select>
            <button type="button" class="gm-move" :disabled="i === 0 || !canEdit" :aria-label="`Mover la foto ${i + 1} hacia delante`" data-testid="gallery-item-left" @click="move(i, -1)">←</button>
            <button type="button" class="gm-move" :disabled="i === rows.length - 1 || !canEdit" :aria-label="`Mover la foto ${i + 1} hacia atrás`" data-testid="gallery-item-right" @click="move(i, 1)">→</button>
          </div>
          <div class="absolute inset-x-0 bottom-9 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
            <button
              v-if="row.image !== coverValue && canEdit"
              type="button"
              class="rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-ink hover:bg-white"
              :data-testid="`gallery-item-cover-${row.id}`"
              @click="$emit('use-as-cover', row.image)"
            >
              Usar como portada
            </button>
            <span v-else class="flex-1" />
            <button type="button" class="rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-ink hover:bg-white" :data-testid="`gallery-item-edit-${row.id}`" @click="openEdit(row)">Datos</button>
            <a :href="mediaUrl(row.image)" download class="rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-ink hover:bg-white" title="Descargar">↓</a>
            <button v-if="canEdit" type="button" class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-600" title="Eliminar" :data-testid="`gallery-item-delete-${row.id}`" @click="remove(row.id)">
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Metadatos de la foto abierta -->
      <div v-if="editing" class="mt-4" data-testid="gallery-item-metadata">
        <div class="mb-2 flex items-center justify-between">
          <p class="text-[13px] font-medium text-ink">Datos de la foto</p>
          <button type="button" class="text-[12px] text-stone-500 hover:text-ink" @click="editing = null">Cerrar</button>
        </div>
        <MediaMetadataForm :model="edit" classify :error="editError" :saving="savingEdit" @save="saveEdit" />
      </div>

      <p v-if="error" class="mt-2 text-[11px] font-medium text-red-600" data-testid="gallery-error">{{ error }}</p>
      <p v-if="rows.length > 1" class="mt-3 text-[11px] text-stone-400">Arrastra una foto (o usa ← →) para reordenar la galería: el orden es el de la web. La portada es la foto principal del mosaico. Las ocultas, privadas o no publicables se ven atenuadas: no salen ni en la web ni en los portales. Una foto sin estancia sigue en «Todas las fotos».</p>
    </template>

    <!-- Vídeos, tours, renders, PDF, drone y 360 (FASE 7): justo debajo de las fotos. -->
    <div v-if="kind" class="mt-8 border-t border-line pt-6">
      <h3 class="mb-2 text-[15px] font-medium text-ink">Vídeos, tours, renders, PDF, drone y 360°</h3>
      <p class="mb-3 text-[12px] text-stone-500">En la web salen en sus categorías del visor (Vídeos, Vista 360°, Tour virtual, Renders, Vista aérea); los planos se gestionan en el paso «Planos».</p>
      <PropertyMediaManager :parent-id="parentId" :kind="kind" :can-edit="canEdit" :trashed="trashed" />
    </div>
  </div>
</template>

<script setup lang="ts">
import MediaMetadataForm from '~/components/admin/property/MediaMetadataForm.vue'
import PropertyMediaManager from '~/components/admin/property/PropertyMediaManager.vue'
import { MEDIA_ROOMS, MEDIA_ROOM_LABELS } from '~/utils/mediaRooms'
import { makeThumbnail, thumbFileName } from '~/utils/imageThumb'

/**
 * Galería de una propiedad (los dos catálogos) — orden, portada, metadatos
 * por foto (título, alt, pie, idioma, publicable, privada, oculta), y desde
 * la Cola 5: subida múltiple con cola (arrastrar y soltar, vista previa,
 * validación antes de subir, tres en paralelo), estancia y descripción por
 * foto, clasificación masiva, reordenar con botones (teclado y táctil) y
 * miniaturas WebP generadas en el navegador (la web las usa en el mosaico y
 * el visor; sin miniatura, el original). Debajo, el resto de la multimedia
 * (`PropertyMediaManager`). Borrar una foto no deja huérfanos: el servidor
 * libera el fichero si ninguna otra ficha de la agencia lo usa.
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
const error = ref('')

function isOut(row: any) {
  return row.isHidden || row.isPrivate || row.isPublishable === 0
}

// Todas las fotos de la propiedad, página a página (el CRUD sirve 100 por página).
async function load() {
  if (!props.parentId) {
    rows.value = []
    return
  }
  const all: any[] = []
  for (let page = 1; page <= 20; page++) {
    const res = await $fetch<{ rows: any[]; total?: number }>(`/api/admin/${props.childResource}`, { query: { perPage: 100, page, [props.parentField]: props.parentId } })
    all.push(...res.rows.filter((r) => r[props.parentField] === props.parentId))
    if (res.rows.length < 100) break
  }
  rows.value = all.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id)
  const ids = new Set(rows.value.map((r) => r.id))
  selected.value = new Set([...selected.value].filter((id) => ids.has(id)))
}

// --- Subida múltiple con cola ---------------------------------------------------
const ACCEPT = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const MAX_BYTES = 10 * 1024 * 1024
const PARALLEL = 3
interface QueueItem {
  id: number
  file: File
  name: string
  preview: string
  status: 'queued' | 'uploading' | 'done' | 'error'
  error: string
}
const queue = ref<QueueItem[]>([])
const uploading = ref(false)
const dragging = ref(false)
const newRoom = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
let queueSeq = 0

function validateFile(file: File): string {
  if (!ACCEPT.has(file.type)) return 'Formato no admitido: JPG, PNG, WebP o GIF'
  if (file.size > MAX_BYTES) return 'Más de 10 MB'
  return ''
}
function enqueue(files: File[]) {
  if (!files.length || !props.parentId || !props.canEdit || props.trashed) return
  for (const file of files) {
    const err = validateFile(file)
    queue.value.push({ id: ++queueSeq, file, name: file.name, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '', status: err ? 'error' : 'queued', error: err })
  }
  void processQueue()
}
function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  enqueue([...(input.files || [])])
  input.value = ''
}
function onDrop(e: DragEvent) {
  dragging.value = false
  enqueue([...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/') || !f.type))
}

async function uploadFile(file: Blob, name: string): Promise<string> {
  const fd = new FormData()
  fd.append('file', file, name)
  fd.append('folder', props.childResource)
  const uploaded = await $fetch<{ key: string }>('/api/admin/upload', { method: 'POST', body: fd })
  return uploaded.key
}
/** Sube la miniatura WebP de una imagen (fichero o URL del mismo origen); null si no se pudo (la web usará el original). */
async function uploadThumb(src: Blob | string, name: string): Promise<string | null> {
  const thumb = await makeThumbnail(src)
  if (!thumb) return null
  try {
    return await uploadFile(thumb.blob, thumbFileName(name))
  } catch {
    return null
  }
}
async function processQueue() {
  if (uploading.value) return
  uploading.value = true
  error.value = ''
  try {
    const sortBase = rows.value.length
    let created = 0
    const workers = Array.from({ length: PARALLEL }, async () => {
      for (;;) {
        const item = queue.value.find((q) => q.status === 'queued')
        if (!item) return
        item.status = 'uploading'
        try {
          const key = await uploadFile(item.file, item.file.name)
          const thumbKey = await uploadThumb(item.file, item.file.name)
          await $fetch(`/api/admin/${props.childResource}`, {
            method: 'POST',
            body: { [props.parentField]: props.parentId, image: key, sortOrder: sortBase + created++, room: newRoom.value || null, ...(thumbKey ? { thumbKey } : {}) },
          })
          item.status = 'done'
        } catch (err: any) {
          item.status = 'error'
          item.error = err?.data?.statusMessage || err?.statusMessage || 'No se pudo subir'
        }
      }
    })
    await Promise.all(workers)
    await load()
    const done = queue.value.filter((q) => q.status === 'done').length
    if (done) toast.success(done === 1 ? 'Foto añadida' : `${done} fotos añadidas`)
  } finally {
    uploading.value = false
  }
}

// --- Estancia por foto y miniaturas de las existentes ----------------------------
async function setRoom(row: any, room: string) {
  try {
    await $fetch(`/api/admin/${props.childResource}/${row.id}`, { method: 'PUT', body: { room: room || null } })
    row.room = room || null
  } catch {
    toast.error('No se pudo guardar la estancia')
  }
}
const thumbing = ref(false)
async function bulkThumbnails() {
  const targets = rows.value.filter((r) => selected.value.has(r.id) && !r.thumbKey && !/^https?:\/\//i.test(String(r.image)))
  if (!targets.length) {
    toast.success('Las fotos seleccionadas ya tienen miniatura')
    return
  }
  thumbing.value = true
  let made = 0
  try {
    for (const r of targets) {
      const thumbKey = await uploadThumb(mediaUrl(r.image), String(r.image).split('/').pop() || 'foto')
      if (!thumbKey) continue
      await $fetch(`/api/admin/${props.childResource}/${r.id}`, { method: 'PUT', body: { thumbKey } })
      r.thumbKey = thumbKey
      made++
    }
    toast.success(made === targets.length ? `${made} miniaturas generadas` : `${made} de ${targets.length} miniaturas generadas`)
  } finally {
    thumbing.value = false
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
const bulkRoom = ref('')
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
async function bulkSet(patch: Record<string, number | string | null>) {
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
    room: row.room || '',
    description: row.description || '',
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
    await $fetch(`/api/admin/${props.childResource}/${editing.value.id}`, { method: 'PUT', body: { ...edit, language: edit.language || null, room: edit.room || null, description: edit.description || null } })
    editing.value = null
    toast.success('Datos de la foto guardados')
    await load()
  } catch (e: any) {
    editError.value = e?.data?.statusMessage || 'No se pudo guardar'
  } finally {
    savingEdit.value = false
  }
}

// --- Reordenar: arrastrando o con ← → ------------------------------------------
const dragFrom = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

async function persistOrder() {
  // El orden se guarda al momento: la galería no espera a «Guardar» del formulario.
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
async function onReorderDrop(to: number) {
  const from = dragFrom.value
  dragFrom.value = null
  dragOverIndex.value = null
  if (from === null || from === to) return
  const [moved] = rows.value.splice(from, 1)
  rows.value.splice(to, 0, moved)
  await persistOrder()
}
async function move(i: number, dir: -1 | 1) {
  const j = i + dir
  if (j < 0 || j >= rows.value.length) return
  ;[rows.value[i], rows.value[j]] = [rows.value[j], rows.value[i]]
  await persistOrder()
}

watch(() => props.parentId, load, { immediate: true })
onBeforeUnmount(() => {
  for (const q of queue.value) if (q.preview) URL.revokeObjectURL(q.preview)
})
</script>

<style scoped>
.gm-move {
  display: inline-flex;
  height: 22px;
  width: 22px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  font-size: 12px;
  color: #57534e;
}
.gm-move:hover:not(:disabled) {
  background: #f1eee8;
  color: #1c1b19;
}
.gm-move:disabled {
  opacity: 0.3;
}
</style>
