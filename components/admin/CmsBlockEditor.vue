<template>
  <div class="cms-editor">
    <div class="inserter">
      <button class="inserter-btn" @click="openInserterAt = openInserterAt === 0 ? null : 0">+</button>
      <div v-if="openInserterAt === 0" class="inserter-menu">
        <div v-for="g in INSERT_GROUPS" :key="g.label" class="inserter-group">
          <p class="inserter-group-label">{{ g.label }}</p>
          <button v-for="type in g.items" :key="type" class="inserter-item" @click="insert(0, type); openInserterAt = null">{{ TYPE_LABEL[type] }}</button>
        </div>
      </div>
    </div>
    <template v-for="(block, i) in blocks" :key="block.id">
      <div
        class="block-wrap group"
        :class="{ dragging: dragIndex === i, over: overIndex === i }"
        draggable="true"
        @dragstart="dragIndex = i"
        @dragover.prevent="overIndex = i"
        @dragleave="overIndex = null"
        @drop="onDrop(i)"
        @dragend="dragIndex = null; overIndex = null"
      >
        <div class="block-toolbar">
          <span class="handle" title="Arrastra para reordenar">⠿</span>
          <span class="type-tag">{{ TYPE_LABEL[block.type] || block.type }}</span>
          <span class="spacer" />
          <button title="Subir" @click="move(i, -1)">↑</button>
          <button title="Bajar" @click="move(i, 1)">↓</button>
          <button title="Duplicar" @click="duplicate(i)">⧉</button>
          <button title="Eliminar" class="danger" @click="remove(i)">✕</button>
        </div>

        <!-- Heading -->
        <div v-if="block.type === 'heading'" class="block-body">
          <select v-model.number="block.level" class="mini-select">
            <option :value="2">H2</option>
            <option :value="3">H3</option>
          </select>
          <input v-model="block.text" class="input mt-2" placeholder="Título de sección" />
        </div>

        <!-- Paragraph -->
        <textarea v-else-if="block.type === 'paragraph'" v-model="block.text" class="input block-body" rows="4" placeholder="Escribe un párrafo…" />

        <!-- Quote -->
        <div v-else-if="block.type === 'quote'" class="block-body space-y-2">
          <textarea v-model="block.text" class="input" rows="2" placeholder="Texto de la cita" />
          <input v-model="block.author" class="input" placeholder="Autor (opcional)" />
        </div>

        <!-- Callout -->
        <div v-else-if="block.type === 'callout'" class="block-body space-y-2">
          <select v-model="block.variant" class="mini-select">
            <option value="info">ℹ️ Info</option>
            <option value="warning">⚠️ Aviso</option>
            <option value="success">✅ Éxito</option>
          </select>
          <textarea v-model="block.text" class="input" rows="2" placeholder="Mensaje destacado" />
        </div>

        <!-- Divider -->
        <div v-else-if="block.type === 'divider'" class="block-body">
          <hr class="border-line" />
        </div>

        <!-- Image -->
        <div v-else-if="block.type === 'image'" class="block-body space-y-2">
          <div v-if="block.src" class="relative">
            <img :src="mediaUrl(block.src)" class="max-h-64 w-full rounded-lg border border-line object-cover" />
          </div>
          <input type="file" accept="image/*" class="text-sm" @change="uploadInto(block, 'src', $event)" />
          <input v-model="block.alt" class="input" placeholder="Texto alternativo (ALT) — importante para SEO" />
          <input v-model="block.caption" class="input" placeholder="Pie de foto (opcional)" />
        </div>

        <!-- Gallery -->
        <div v-else-if="block.type === 'gallery'" class="block-body space-y-2">
          <div class="grid grid-cols-3 gap-2">
            <div v-for="(img, gi) in block.images" :key="gi" class="relative">
              <img :src="mediaUrl(img.src)" class="h-20 w-full rounded object-cover" />
              <button class="absolute right-1 top-1 rounded-full bg-white/90 px-1.5 text-xs" @click="block.images.splice(gi, 1)">✕</button>
            </div>
          </div>
          <input type="file" accept="image/*" class="text-sm" @change="addGalleryImage(block, $event)" />
        </div>

        <!-- Video / YouTube -->
        <div v-else-if="block.type === 'video'" class="block-body">
          <input v-model="block.url" class="input" placeholder="URL de YouTube" />
          <p class="mt-1 text-[11px] text-stone-450">Se incrusta automáticamente al guardar.</p>
        </div>

        <!-- Button / CTA -->
        <div v-else-if="block.type === 'button'" class="block-body grid gap-2 sm:grid-cols-2">
          <input v-model="block.text" class="input" placeholder="Texto del botón" />
          <input v-model="block.url" class="input" placeholder="https://…" />
        </div>

        <div v-else-if="block.type === 'cta'" class="block-body space-y-2">
          <input v-model="block.title" class="input" placeholder="Título de la llamada a la acción" />
          <textarea v-model="block.text" class="input" rows="2" placeholder="Texto de apoyo" />
          <div class="grid grid-cols-2 gap-2">
            <input v-model="block.buttonText" class="input" placeholder="Texto del botón" />
            <input v-model="block.buttonUrl" class="input" placeholder="https://…" />
          </div>
        </div>

        <!-- Table -->
        <div v-else-if="block.type === 'table'" class="block-body space-y-2">
          <div v-for="(row, ri) in block.rows" :key="ri" class="flex gap-1.5">
            <input v-for="(cell, ci) in row" :key="ci" v-model="block.rows[ri][ci]" class="input !py-1 text-xs" :class="ri === 0 ? 'font-semibold' : ''" />
            <button class="text-red-500" @click="block.rows.splice(ri, 1)">✕</button>
          </div>
          <div class="flex gap-2 text-xs">
            <button class="text-emerald-700 hover:underline" @click="addTableRow(block)">+ Fila</button>
            <button class="text-emerald-700 hover:underline" @click="addTableCol(block)">+ Columna</button>
          </div>
        </div>

        <!-- Code -->
        <div v-else-if="block.type === 'code'" class="block-body space-y-2">
          <input v-model="block.language" class="input !w-32" placeholder="lenguaje" />
          <textarea v-model="block.code" class="input font-mono text-xs" rows="6" placeholder="código…" />
        </div>

        <!-- Columns -->
        <div v-else-if="block.type === 'columns'" class="block-body grid grid-cols-2 gap-3">
          <textarea v-model="block.left" class="input" rows="4" placeholder="Columna izquierda" />
          <textarea v-model="block.right" class="input" rows="4" placeholder="Columna derecha" />
        </div>

        <!-- FAQ / Accordion -->
        <div v-else-if="block.type === 'faq'" class="block-body space-y-3">
          <div v-for="(item, fi) in block.items" :key="fi" class="rounded-lg border border-line p-3">
            <div class="flex items-center gap-2">
              <input v-model="item.q" class="input" placeholder="Pregunta" />
              <button class="text-red-500" @click="block.items.splice(fi, 1)">✕</button>
            </div>
            <textarea v-model="item.a" class="input mt-2" rows="2" placeholder="Respuesta" />
          </div>
          <button class="text-xs text-emerald-700 hover:underline" @click="block.items.push({ q: '', a: '' })">+ Pregunta</button>
        </div>

        <!-- HTML -->
        <div v-else-if="block.type === 'html'" class="block-body">
          <textarea v-model="block.html" class="input font-mono text-xs" rows="6" placeholder="<div>HTML personalizado…</div>" />
          <p class="mt-1 text-[11px] text-amber-600">Se inserta tal cual en la página pública — solo para contenido de confianza.</p>
        </div>

        <!-- Dynamic: properties feed (real catalog data, fetched at render time) -->
        <div v-else-if="block.type === 'properties'" class="block-body space-y-2">
          <p class="text-[11px] text-stone-450">Muestra propiedades reales de tu catálogo — se cargan al visualizar la página, no una copia estática.</p>
          <div class="grid grid-cols-2 gap-2">
            <select v-model="block.mode" class="input">
              <option value="latest">Últimas</option>
              <option value="featured">Destacadas</option>
            </select>
            <input v-model.number="block.limit" type="number" min="1" max="12" class="input" placeholder="Nº de propiedades" />
          </div>
        </div>

        <!-- Dynamic: mortgage calculator (real logic, same component as property pages) -->
        <div v-else-if="block.type === 'mortgage_calculator'" class="block-body">
          <input v-model.number="block.price" type="number" class="input" placeholder="Precio de referencia (AED)" />
          <p class="mt-1 text-[11px] text-stone-450">Calculadora real e interactiva — el lector puede ajustar entrada y plazo.</p>
        </div>
      </div>
      <div class="inserter">
        <button class="inserter-btn" @click="openInserterAt = openInserterAt === i + 1 ? null : i + 1">+</button>
        <div v-if="openInserterAt === i + 1" class="inserter-menu">
          <div v-for="g in INSERT_GROUPS" :key="g.label" class="inserter-group">
            <p class="inserter-group-label">{{ g.label }}</p>
            <button v-for="type in g.items" :key="type" class="inserter-item" @click="insert(i + 1, type); openInserterAt = null">{{ TYPE_LABEL[type] }}</button>
          </div>
        </div>
      </div>
    </template>

    <p v-if="!blocks.length" class="py-8 text-center text-sm text-stone-450">Este artículo no tiene bloques todavía. Usa el botón "+" para empezar.</p>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ modelValue: any[] }>()
const emit = defineEmits<{ 'update:modelValue': [any[]] }>()

const blocks = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const TYPE_LABEL: Record<string, string> = {
  heading: 'Encabezado', paragraph: 'Párrafo', image: 'Imagen', gallery: 'Galería', video: 'Vídeo',
  button: 'Botón', cta: 'CTA', table: 'Tabla', code: 'Código', divider: 'Separador', quote: 'Cita',
  callout: 'Callout', columns: 'Columnas', faq: 'FAQ', html: 'HTML',
  properties: 'Propiedades (catálogo)', mortgage_calculator: 'Calculadora hipotecaria',
}

let seq = 0
function newId() {
  seq += 1
  return `b${Date.now()}${seq}`
}

function blankBlock(type: string): any {
  const id = newId()
  switch (type) {
    case 'heading': return { id, type, level: 2, text: '' }
    case 'paragraph': return { id, type, text: '' }
    case 'quote': return { id, type, text: '', author: '' }
    case 'callout': return { id, type, text: '', variant: 'info' }
    case 'divider': return { id, type }
    case 'image': return { id, type, src: '', alt: '', caption: '' }
    case 'gallery': return { id, type, images: [] }
    case 'video': return { id, type, url: '' }
    case 'button': return { id, type, text: '', url: '', style: 'primary' }
    case 'cta': return { id, type, title: '', text: '', buttonText: '', buttonUrl: '' }
    case 'table': return { id, type, rows: [['Columna 1', 'Columna 2'], ['', '']] }
    case 'code': return { id, type, code: '', language: '' }
    case 'columns': return { id, type, left: '', right: '' }
    case 'faq': return { id, type, items: [{ q: '', a: '' }] }
    case 'html': return { id, type, html: '' }
    case 'properties': return { id, type, mode: 'latest', limit: 3 }
    case 'mortgage_calculator': return { id, type, price: null }
    default: return { id, type: 'paragraph', text: '' }
  }
}

function insert(at: number, type: string) {
  const next = [...blocks.value]
  next.splice(at, 0, blankBlock(type))
  blocks.value = next
}
function remove(i: number) {
  const next = [...blocks.value]
  next.splice(i, 1)
  blocks.value = next
}
function duplicate(i: number) {
  const next = [...blocks.value]
  const copy = JSON.parse(JSON.stringify(next[i]))
  copy.id = newId()
  next.splice(i + 1, 0, copy)
  blocks.value = next
}
function move(i: number, dir: number) {
  const j = i + dir
  if (j < 0 || j >= blocks.value.length) return
  const next = [...blocks.value]
  ;[next[i], next[j]] = [next[j], next[i]]
  blocks.value = next
}

const dragIndex = ref<number | null>(null)
const overIndex = ref<number | null>(null)
function onDrop(i: number) {
  if (dragIndex.value === null || dragIndex.value === i) return
  const next = [...blocks.value]
  const [moved] = next.splice(dragIndex.value, 1)
  next.splice(i, 0, moved)
  blocks.value = next
  dragIndex.value = null
  overIndex.value = null
}

function addTableRow(block: any) {
  block.rows.push(new Array(block.rows[0]?.length || 2).fill(''))
}
function addTableCol(block: any) {
  for (const row of block.rows) row.push('')
}

const toast = useToast()
async function uploadFile(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await $fetch<{ key: string }>('/api/admin/cms/media', { method: 'POST', body: fd })
  return res.key
}
async function uploadInto(block: any, field: string, e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    block[field] = await uploadFile(file)
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || 'No se pudo subir la imagen')
  }
}
async function addGalleryImage(block: any, e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const key = await uploadFile(file)
    block.images.push({ src: key, alt: '' })
  } catch (err: any) {
    toast.error(err?.data?.statusMessage || 'No se pudo subir la imagen')
  } finally {
    ;(e.target as HTMLInputElement).value = ''
  }
}

// "/"-style inserter: one popover menu, positioned by index of the gap clicked.
const openInserterAt = ref<number | null>(null)
const INSERT_GROUPS = [
  { label: 'Texto', items: ['heading', 'paragraph', 'quote', 'callout', 'divider'] },
  { label: 'Media', items: ['image', 'gallery', 'video'] },
  { label: 'Interacción', items: ['button', 'cta', 'faq'] },
  { label: 'Datos', items: ['table', 'code', 'columns', 'html'] },
  { label: 'SaaS dinámico', items: ['properties', 'mortgage_calculator'] },
]
</script>

<style scoped>
.cms-editor { display: flex; flex-direction: column; }
.block-wrap {
  position: relative;
  border: 1px solid transparent;
  border-radius: 0.75rem;
  padding: 0.5rem 0.75rem 0.75rem;
  transition: border-color 0.15s;
}
.block-wrap:hover { border-color: #e7e4de; background: #fafaf9; }
.block-wrap.dragging { opacity: 0.4; }
.block-wrap.over { border-color: #16150f; border-style: dashed; }
.block-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  opacity: 0;
  transition: opacity 0.15s;
  margin-bottom: 0.35rem;
  font-size: 11px;
  color: #78716c;
}
.block-wrap:hover .block-toolbar { opacity: 1; }
.block-toolbar .handle { cursor: grab; font-size: 13px; }
.block-toolbar .type-tag { font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; font-size: 10px; }
.block-toolbar .spacer { flex: 1; }
.block-toolbar button { padding: 0.1rem 0.35rem; border-radius: 0.35rem; }
.block-toolbar button:hover { background: #e7e4de; }
.block-toolbar button.danger:hover { background: #fee2e2; color: #dc2626; }
.mini-select { border: 1px solid #e7e4de; border-radius: 0.5rem; padding: 0.25rem 0.5rem; font-size: 12px; }
.inserter { position: relative; display: flex; justify-content: center; height: 0.5rem; margin: 0.15rem 0; }
.inserter-btn {
  width: 1.4rem; height: 1.4rem; border-radius: 9999px; border: 1px solid #e7e4de; background: #fff;
  color: #78716c; font-size: 13px; line-height: 1; opacity: 0; transition: opacity 0.15s;
}
.cms-editor:hover .inserter-btn, .inserter:hover .inserter-btn { opacity: 1; }
.inserter-menu {
  position: absolute; top: 1.6rem; z-index: 20; width: 15rem; border: 1px solid #e7e4de; border-radius: 0.75rem;
  background: #fff; box-shadow: 0 8px 30px -8px rgba(0,0,0,0.2); padding: 0.5rem; max-height: 20rem; overflow-y: auto;
}
.inserter-group-label { font-size: 10px; font-weight: 600; text-transform: uppercase; color: #a8a29e; padding: 0.3rem 0.5rem; }
.inserter-item { display: block; width: 100%; text-align: left; padding: 0.35rem 0.5rem; border-radius: 0.5rem; font-size: 13px; }
.inserter-item:hover { background: #f5f5f4; }
</style>
