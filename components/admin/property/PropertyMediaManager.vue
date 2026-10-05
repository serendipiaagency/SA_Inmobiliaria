<template>
  <div data-testid="property-media">
    <p v-if="!parentId" class="rounded-xl border border-dashed border-line px-6 py-8 text-center text-sm text-stone-500">
      Guarda la propiedad primero; después podrás añadir vídeos, tours, renders, PDF, drone y fotos 360.
    </p>
    <template v-else>
      <p class="mb-3 text-[13px] text-stone-500">
        Vídeos (los que quieras), tours virtuales, renders, PDF (folleto, memoria de calidades), tomas de drone y fotos 360. Cada recurso tiene su título, texto alternativo, pie e idioma, y tres interruptores:
        <strong>publicable</strong> (puede salir en la web y en los portales), <strong>privado</strong> (sólo el equipo; su fichero deja de servirse sin sesión) y <strong>oculto</strong> (se conserva, pero no se publica en ningún sitio).
      </p>

      <!-- Acciones sobre la selección -->
      <div v-if="rows.length" class="mb-3 flex flex-wrap items-center gap-2 text-[12px]" data-testid="property-media-bulk">
        <label class="flex items-center gap-1.5 text-stone-600">
          <input type="checkbox" :checked="allSelected" :indeterminate.prop="someSelected && !allSelected" aria-label="Seleccionar todos los recursos" @change="toggleAll"> Seleccionar todo
        </label>
        <template v-if="selected.size">
          <span class="text-stone-400">{{ selected.size }} seleccionados:</span>
          <button v-if="canEdit" type="button" class="pe-btn-quiet !py-1" data-testid="property-media-bulk-hide" @click="bulkSet({ isHidden: 1 })">Ocultar</button>
          <button v-if="canEdit" type="button" class="pe-btn-quiet !py-1" @click="bulkSet({ isHidden: 0 })">Mostrar</button>
          <button v-if="canEdit" type="button" class="pe-btn-quiet !py-1" @click="bulkSet({ isPrivate: 1 })">Privado</button>
          <button v-if="canEdit" type="button" class="pe-btn-quiet !py-1" @click="bulkSet({ isPrivate: 0 })">No privado</button>
          <button type="button" class="pe-btn-quiet !py-1" @click="bulkDownload">Descargar</button>
          <button v-if="canEdit" type="button" class="pe-btn-quiet !py-1 text-red-600" @click="bulkRemove">A la papelera</button>
        </template>
      </div>

      <p v-if="loading" class="py-6 text-center text-sm text-stone-400">Cargando…</p>
      <p v-else-if="!rows.length" class="mb-4 rounded-xl border border-dashed border-line px-6 py-6 text-center text-sm text-stone-500">Todavía no hay recursos multimedia.</p>
      <div v-else class="mb-4 space-y-4">
        <section v-for="g in groups" :key="g.type">
          <h4 class="mb-2 text-[13px] font-semibold text-ink">{{ PROPERTY_MEDIA_TYPE_LABELS[g.type] }} <span class="font-normal text-stone-400">({{ g.items.length }})</span></h4>
          <ul class="divide-y divide-line rounded-xl border border-line bg-white">
            <li v-for="m in g.items" :key="m.id" class="px-3 py-3" data-testid="property-media-row" :data-media-id="m.id">
              <div class="flex flex-wrap items-start gap-3">
                <input type="checkbox" class="mt-1" :checked="selected.has(m.id)" :aria-label="`Seleccionar ${m.title || PROPERTY_MEDIA_TYPE_LABELS[m.mediaType]}`" @change="toggle(m.id)">
                <div class="h-14 w-20 shrink-0 overflow-hidden rounded-md bg-stone-100">
                  <img v-if="isImage(m)" :src="srcOf(m)" :alt="m.alt || ''" class="h-full w-full object-cover" loading="lazy" >
                  <div v-else class="flex h-full w-full items-center justify-center text-[10px] font-semibold uppercase text-stone-400">{{ m.mediaType === 'pdf' ? 'PDF' : m.url ? 'Enlace' : 'Fichero' }}</div>
                </div>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-[13px] font-medium text-ink">{{ m.title || PROPERTY_MEDIA_TYPE_LABELS[m.mediaType] }}</p>
                  <p class="truncate text-[11px] text-stone-400">{{ m.url || m.r2Key }}</p>
                  <div class="mt-1 flex flex-wrap gap-1">
                    <span v-if="m.isMain" class="rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold text-white">Principal</span>
                    <span v-if="!m.isPublishable" class="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-600">No publicable</span>
                    <span v-if="m.isPrivate" class="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-800">Privado</span>
                    <span v-if="m.isHidden" class="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800" data-testid="property-media-hidden-badge">Oculto</span>
                    <span v-if="m.language" class="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-600">{{ MEDIA_LANGUAGE_LABELS[m.language] || m.language }}</span>
                  </div>
                </div>
                <div class="flex shrink-0 flex-col items-end gap-1 text-[12px]">
                  <a :href="srcOf(m)" target="_blank" rel="noopener" class="font-semibold text-ink hover:underline">{{ m.url ? 'Abrir' : 'Descargar' }}</a>
                  <button v-if="canEdit" type="button" class="text-stone-600 hover:text-ink" @click="toggleEdit(m)">{{ editingId === m.id ? 'Cerrar' : 'Editar' }}</button>
                  <button v-if="canEdit" type="button" class="text-red-600 hover:underline" @click="remove(m)">A la papelera</button>
                </div>
              </div>
              <MediaMetadataForm v-if="editingId === m.id" class="mt-3" :model="edit" :show-main="true" :error="editError" :saving="savingEdit" @save="saveEdit(m)" />
            </li>
          </ul>
        </section>
      </div>

      <!-- Alta -->
      <div v-if="canEdit" class="rounded-xl border border-line bg-stone-50/60 p-4" data-testid="property-media-add">
        <p class="pe-label">Añadir un recurso</p>
        <p v-if="trashed" class="text-[12px] text-amber-700">La propiedad está en la papelera: restáurala antes de añadirle multimedia.</p>
        <div v-else class="grid gap-3 sm:grid-cols-2">
          <label class="block"><span class="pe-label">Tipo</span>
            <select v-model="draft.mediaType" class="pe-input" data-testid="property-media-type" @change="resetSource">
              <option v-for="t in PROPERTY_MEDIA_TYPES" :key="t" :value="t">{{ PROPERTY_MEDIA_TYPE_LABELS[t] }}</option>
            </select>
          </label>
          <label class="block"><span class="pe-label">Título</span><input v-model="draft.title" class="pe-input" maxlength="200" data-testid="property-media-title" ></label>

          <div class="sm:col-span-2">
            <VideoField v-if="draft.mediaType === 'video'" :model-value="draft.value" :upload-folder="resource" @update:model-value="(v) => (draft.value = v || '')" />
            <template v-else>
              <p v-if="draft.fileKey" class="flex items-center gap-2 text-[12px] text-emerald-700">
                Fichero subido. <button type="button" class="text-stone-500 underline hover:text-ink" @click="draft.fileKey = ''">Quitar</button>
              </p>
              <template v-else>
                <input v-if="accepts('url')" v-model="draft.value" type="url" class="pe-input" placeholder="https://…" aria-label="Enlace del recurso" data-testid="property-media-url" >
                <p v-if="urlError" class="mt-1 text-[11px] text-red-600">{{ urlError }}</p>
                <label v-if="fileAccept" class="mt-2 block">
                  <span class="text-[11px] text-stone-500">{{ accepts('url') ? 'o sube un fichero' : 'Sube el fichero' }} ({{ fileHint }})</span>
                  <input type="file" :accept="fileAccept" class="block w-full text-xs text-stone-500" data-testid="property-media-file" @change="onFile" >
                </label>
                <p v-if="uploading" class="mt-1 text-[11px] text-stone-400">Subiendo…</p>
              </template>
            </template>
          </div>
          <label class="block"><span class="pe-label">Texto alternativo</span><input v-model="draft.alt" class="pe-input" maxlength="300" ></label>
          <label class="block"><span class="pe-label">Idioma</span>
            <select v-model="draft.language" class="pe-input"><option value="">—</option><option v-for="l in MEDIA_LANGUAGES" :key="l" :value="l">{{ MEDIA_LANGUAGE_LABELS[l] }}</option></select>
          </label>
          <div class="flex flex-wrap gap-3 text-[12px] text-stone-600 sm:col-span-2">
            <label class="flex items-center gap-1.5"><input v-model="draft.isPublishable" type="checkbox"> Publicable</label>
            <label class="flex items-center gap-1.5"><input v-model="draft.isPrivate" type="checkbox"> Privado</label>
            <label class="flex items-center gap-1.5"><input v-model="draft.isHidden" type="checkbox"> Oculto</label>
            <label class="flex items-center gap-1.5"><input v-model="draft.isMain" type="checkbox"> Principal de su tipo</label>
          </div>
          <div class="sm:col-span-2">
            <button type="button" class="pe-btn-dark" :disabled="saving || !source || !!urlError" data-testid="property-media-submit" @click="add">{{ saving ? 'Guardando…' : 'Añadir' }}</button>
            <p v-if="addError" class="mt-1 text-[12px] font-medium text-red-600">{{ addError }}</p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import VideoField from '~/components/property-builder/VideoField.vue'
import MediaMetadataForm from '~/components/admin/property/MediaMetadataForm.vue'
import { MEDIA_LANGUAGES, MEDIA_LANGUAGE_LABELS, PROPERTY_MEDIA_SOURCES, PROPERTY_MEDIA_TYPES, PROPERTY_MEDIA_TYPE_LABELS, type PropertyMediaType } from '~/utils/propertyMediaCatalog'

/**
 * Multimedia de una propiedad que no es foto de galería ni plano (FASE 7,
 * bloque N7a), igual en los dos catálogos: vídeos (varios), tours virtuales,
 * renders, PDF, drone y 360 — recurso `property-media` del motor genérico.
 * Los ficheros se suben con las subidas de siempre (`/api/admin/upload` para
 * imagen y PDF, la subida por partes para vídeo); el servidor comprueba que
 * el fichero es de esta agencia y del formato que admite el tipo.
 */
const props = withDefaults(defineProps<{ parentId: number | null; kind: 'agent' | 'developer'; canEdit?: boolean; trashed?: boolean }>(), { canEdit: true, trashed: false })
const toast = useToast()
const { confirm } = useConfirm()
const resource = computed(() => (props.kind === 'developer' ? 'developer-properties' : 'properties'))

const rows = ref<any[]>([])
const loading = ref(false)

async function load() {
  if (!props.parentId) return
  loading.value = true
  try {
    const res = await $fetch<{ rows: any[] }>('/api/admin/property-media', { query: { propertyKind: props.kind, propertyId: props.parentId, perPage: 100 } })
    rows.value = res.rows.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  } catch (e: any) {
    rows.value = []
    toast.error(e?.data?.statusMessage || 'No se pudo cargar la multimedia')
  } finally {
    loading.value = false
  }
}

const groups = computed(() =>
  (PROPERTY_MEDIA_TYPES as readonly string[]).map((type) => ({ type, items: rows.value.filter((r) => r.mediaType === type) })).filter((g) => g.items.length),
)

function isHttps(v: string) {
  return /^https:\/\//i.test(v)
}
function srcOf(m: any) {
  return m.r2Key ? `/api/media/${m.r2Key}` : m.url
}
function isImage(m: any) {
  return !!m.r2Key && ['render', 'drone', 'pano360', 'other'].includes(m.mediaType) && !/\.(pdf|mp4|webm)$/i.test(m.r2Key)
}

// --- Selección y acciones en bloque -------------------------------------------
const selected = ref(new Set<number>())
const allSelected = computed(() => rows.value.length > 0 && selected.value.size === rows.value.length)
const someSelected = computed(() => selected.value.size > 0)
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
      await $fetch(`/api/admin/property-media/${id}`, { method: 'PUT', body: patch })
    } catch {
      failed++
    }
  }
  if (failed) toast.error(`${failed} de ${ids.length} no se pudieron actualizar`)
  else toast.success('Recursos actualizados')
  await load()
}
function bulkDownload() {
  for (const r of rows.value.filter((x) => selected.value.has(x.id))) {
    const a = document.createElement('a')
    a.href = srcOf(r)
    a.target = '_blank'
    a.rel = 'noopener'
    if (r.r2Key) a.download = ''
    a.click()
  }
}
async function bulkRemove() {
  const ids = [...selected.value]
  const ok = await confirm(`${ids.length} recursos irán a la papelera y dejarán de publicarse.`, { title: '¿Mover a la papelera?', confirmLabel: 'Mover', danger: true })
  if (!ok) return
  for (const id of ids) await $fetch(`/api/admin/property-media/${id}`, { method: 'DELETE' }).catch(() => null)
  selected.value = new Set()
  await load()
}

// --- Edición -----------------------------------------------------------------
const editingId = ref<number | null>(null)
const edit = reactive<Record<string, any>>({})
const editError = ref('')
const savingEdit = ref(false)
function toggleEdit(m: any) {
  editError.value = ''
  if (editingId.value === m.id) {
    editingId.value = null
    return
  }
  editingId.value = m.id
  Object.assign(edit, { title: m.title || '', alt: m.alt || '', caption: m.caption || '', language: m.language || '', isPublishable: !!m.isPublishable, isPrivate: !!m.isPrivate, isHidden: !!m.isHidden, isMain: !!m.isMain })
}
async function saveEdit(m: any) {
  savingEdit.value = true
  editError.value = ''
  try {
    await $fetch(`/api/admin/property-media/${m.id}`, { method: 'PUT', body: { ...edit } })
    editingId.value = null
    await load()
  } catch (e: any) {
    editError.value = e?.data?.statusMessage || 'No se pudo guardar'
  } finally {
    savingEdit.value = false
  }
}
async function remove(m: any) {
  const ok = await confirm('El recurso deja de publicarse. Su fichero se borra para siempre a los 30 días si no lo restauras.', { title: '¿Mover a la papelera?', confirmLabel: 'Mover', danger: true })
  if (!ok) return
  try {
    await $fetch(`/api/admin/property-media/${m.id}`, { method: 'DELETE' })
    await load()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'No se pudo mover a la papelera')
  }
}

// --- Alta --------------------------------------------------------------------
const draft = reactive({ mediaType: 'video' as PropertyMediaType, title: '', alt: '', language: '', value: '', fileKey: '', isPublishable: true, isPrivate: false, isHidden: false, isMain: false })
/** Validación inmediata del enlace: el servidor la repite al guardar. */
const urlError = computed(() => (draft.mediaType !== 'video' && draft.value && !isHttps(draft.value) ? 'El enlace tiene que empezar por https://' : ''))
/** Lo que se va a guardar: el fichero subido o el enlace (o, en vídeo, lo que devuelva el campo de vídeo). */
const source = computed(() => draft.fileKey || draft.value.trim())
const saving = ref(false)
const uploading = ref(false)
const addError = ref('')
function accepts(kind: 'url' | 'image' | 'pdf' | 'video') {
  return PROPERTY_MEDIA_SOURCES[draft.mediaType].includes(kind)
}
const fileAccept = computed(() => {
  const out: string[] = []
  if (accepts('image')) out.push('image/jpeg,image/png,image/webp,image/gif')
  if (accepts('pdf')) out.push('application/pdf')
  return out.join(',')
})
const fileHint = computed(() => [accepts('image') ? 'JPG, PNG, WebP o GIF' : '', accepts('pdf') ? 'PDF' : ''].filter(Boolean).join(' o ') + ', hasta 10 MB')
function resetSource() {
  draft.value = ''
  draft.fileKey = ''
  addError.value = ''
}
async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (!f) return
  uploading.value = true
  addError.value = ''
  try {
    const fd = new FormData()
    fd.append('file', f)
    fd.append('folder', 'property-media')
    const res = await $fetch<{ key: string }>('/api/admin/upload', { method: 'POST', body: fd })
    draft.fileKey = res.key
    draft.value = ''
    if (!draft.title) draft.title = f.name.replace(/\.[^.]+$/, '').slice(0, 200)
  } catch (err: any) {
    addError.value = err?.data?.statusMessage || 'No se pudo subir el fichero'
  } finally {
    uploading.value = false
    input.value = ''
  }
}
async function add() {
  if (!props.parentId || !source.value) return
  saving.value = true
  addError.value = ''
  try {
    const isUrl = /^https?:\/\//i.test(source.value)
    await $fetch('/api/admin/property-media', {
      method: 'POST',
      body: {
        propertyKind: props.kind,
        propertyId: props.parentId,
        mediaType: draft.mediaType,
        url: isUrl ? source.value : null,
        r2Key: isUrl ? null : source.value,
        title: draft.title,
        alt: draft.alt,
        language: draft.language || null,
        isPublishable: draft.isPublishable,
        isPrivate: draft.isPrivate,
        isHidden: draft.isHidden,
        isMain: draft.isMain,
        sortOrder: rows.value.length,
      },
    })
    Object.assign(draft, { title: '', alt: '', language: '', value: '', fileKey: '', isPublishable: true, isPrivate: false, isHidden: false, isMain: false })
    toast.success('Recurso añadido')
    await load()
  } catch (e: any) {
    addError.value = e?.data?.statusMessage || 'No se pudo añadir el recurso'
  } finally {
    saving.value = false
  }
}

watch(() => props.parentId, load, { immediate: true })
</script>
