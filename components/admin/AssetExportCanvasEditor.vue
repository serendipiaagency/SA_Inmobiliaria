<template>
  <div class="flex flex-col gap-4 lg:flex-row">
    <!-- Left: element palette -->
    <div class="w-full shrink-0 space-y-2 lg:w-36">
      <div class="flex gap-2">
        <button type="button" class="flex-1 rounded-lg border border-line px-2 py-1.5 text-xs font-medium disabled:opacity-30" :disabled="!canUndo" title="Deshacer (Ctrl+Z)" @click="undo">↺ Deshacer</button>
        <button type="button" class="flex-1 rounded-lg border border-line px-2 py-1.5 text-xs font-medium disabled:opacity-30" :disabled="!canRedo" title="Rehacer (Ctrl+Shift+Z)" @click="redo">↻ Rehacer</button>
      </div>

      <p class="mb-1 mt-3 text-[11px] font-semibold uppercase text-stone-400">Añadir bloque</p>
      <div class="grid grid-cols-3 gap-2 lg:grid-cols-1">
        <button type="button" class="palette-btn" @click="addElement('text')">Texto</button>
        <button type="button" class="palette-btn" @click="addElement('image')">Imagen</button>
        <button type="button" class="palette-btn" @click="addElement('qr')">QR</button>
      </div>

      <p class="mb-1 mt-4 text-[11px] font-semibold uppercase text-stone-400">Páginas</p>
      <div v-for="(p, i) in structure.pages" :key="p.id" class="flex items-center gap-0.5">
        <button type="button" class="flex-1 rounded-lg border px-2 py-1 text-left text-xs" :class="i === activePageIndex ? 'border-ink bg-stone-50 font-medium' : 'border-line'" @click="activePageIndex = i">
          Página {{ i + 1 }}
        </button>
        <button type="button" class="px-0.5 text-xs text-stone-400 hover:text-ink disabled:opacity-30" :disabled="i === 0" title="Subir" @click="movePage(i, -1)">↑</button>
        <button type="button" class="px-0.5 text-xs text-stone-400 hover:text-ink disabled:opacity-30" :disabled="i === structure.pages.length - 1" title="Bajar" @click="movePage(i, 1)">↓</button>
        <button type="button" class="px-0.5 text-xs text-stone-400 hover:text-ink" title="Duplicar" @click="duplicatePage(i)">⧉</button>
        <button v-if="structure.pages.length > 1" type="button" class="px-0.5 text-xs text-red-500 hover:underline" title="Eliminar" @click="removePage(i)">✕</button>
      </div>
      <button type="button" class="palette-btn" @click="addPage">+ Página</button>
    </div>

    <!-- Center: canvas -->
    <div class="flex-1 overflow-auto rounded-lg bg-stone-100 p-6">
      <div
        ref="canvasEl"
        class="relative mx-auto bg-white shadow-md"
        :style="{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }"
        @mousedown="selected = null"
      >
        <div
          v-for="el in activePage.elements"
          :key="el.id"
          class="absolute cursor-move border"
          :class="selected === el.id ? 'border-2 border-ink' : 'border-dashed border-stone-300'"
          :style="elementStyle(el)"
          @mousedown.stop="startDrag($event, el)"
        >
          <div class="pointer-events-none flex h-full w-full items-center justify-center overflow-hidden px-1 text-center text-[9px] text-stone-500">
            <span v-if="el.type === 'text'">{{ el.binding || '(texto vacío)' }}</span>
            <span v-else-if="el.type === 'image'">🖼 {{ el.binding }}</span>
            <span v-else>▦ QR</span>
          </div>
          <div v-if="selected === el.id" class="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-full border border-white bg-ink" @mousedown.stop="startResize($event, el)" />
        </div>
      </div>
      <p class="mt-2 text-center text-[11px] text-stone-400">{{ format.label }} — {{ format.widthPt }}×{{ format.heightPt }} pt</p>
    </div>

    <!-- Right: properties -->
    <div class="w-full shrink-0 lg:w-64">
      <div v-if="!selectedElement" class="rounded-lg border border-dashed border-line px-4 py-8 text-center text-xs text-stone-400">
        Selecciona un bloque para editarlo
      </div>
      <div v-else class="space-y-3">
        <div class="grid grid-cols-2 gap-2">
          <label class="block text-xs">
            <span class="mb-1 block text-stone-500">X</span>
            <input v-model.number="selectedElement.x" type="number" class="prop-input" >
          </label>
          <label class="block text-xs">
            <span class="mb-1 block text-stone-500">Y</span>
            <input v-model.number="selectedElement.y" type="number" class="prop-input" >
          </label>
          <label class="block text-xs">
            <span class="mb-1 block text-stone-500">Ancho</span>
            <input v-model.number="selectedElement.w" type="number" class="prop-input" >
          </label>
          <label class="block text-xs">
            <span class="mb-1 block text-stone-500">Alto</span>
            <input v-model.number="selectedElement.h" type="number" class="prop-input" >
          </label>
        </div>

        <label class="block text-xs">
          <span class="mb-1 block text-stone-500">Vinculación de datos</span>
          <select v-model="selectedElement.binding" class="prop-input">
            <option value="">— texto fijo —</option>
            <option v-for="token in tokensFor(selectedElement.type)" :key="token" :value="`{{${token}}}`">{{ token }}</option>
          </select>
        </label>
        <label v-if="!selectedElement.binding || !selectedElement.binding.startsWith('{{')" class="block text-xs">
          <span class="mb-1 block text-stone-500">Texto fijo</span>
          <input v-model="selectedElement.binding" class="prop-input" >
        </label>

        <template v-if="selectedElement.type === 'text'">
          <label class="block text-xs">
            <span class="mb-1 block text-stone-500">Tamaño de fuente</span>
            <input v-model.number="styleOf(selectedElement).fontSize" type="number" class="prop-input" >
          </label>
          <label class="flex items-center gap-2 text-xs">
            <input v-model="boldModel" type="checkbox" > Negrita
          </label>
          <label class="block text-xs">
            <span class="mb-1 block text-stone-500">Color</span>
            <select v-model="styleOf(selectedElement).color" class="prop-input">
              <option value="">Texto (por defecto)</option>
              <option value="primary">Color principal (marca)</option>
              <option value="secondary">Color secundario (marca)</option>
              <option value="muted">Gris atenuado</option>
            </select>
          </label>
        </template>

        <label class="flex items-center gap-2 text-xs">
          <input v-model="lockedModel" type="checkbox" > Bloquear posición y contenido
        </label>
        <!-- `locked` is captured here for a future "regenerar automáticamente" action
             (spec section 9) that doesn't exist yet — today it only disables drag/resize
             in this editor, it does not yet protect anything from an automated rebuild. -->

        <button type="button" class="w-full rounded-lg border border-red-200 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50" @click="removeElement">Eliminar bloque</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface TemplateElement {
  id: string
  type: 'text' | 'image' | 'qr'
  x: number
  y: number
  w: number
  h: number
  locked?: boolean
  binding?: string
  style?: Record<string, any>
}
interface TemplatePage {
  id: string
  elements: TemplateElement[]
}
interface TemplateStructure {
  pages: TemplatePage[]
}

// Duplicated from server/utils/assetExport/formats.ts (client bundle can't
// import server/ files) — keep the two lists in sync if formats change.
const FORMATS: Record<string, { label: string; widthPt: number; heightPt: number }> = {
  pdf_a4_portrait: { label: 'PDF A4 vertical', widthPt: 595, heightPt: 842 },
  pdf_a4_landscape: { label: 'PDF A4 horizontal', widthPt: 842, heightPt: 595 },
  pdf_a5_portrait: { label: 'PDF A5 vertical', widthPt: 420, heightPt: 595 },
  pdf_dossier: { label: 'Dossier multipágina', widthPt: 595, heightPt: 842 },
  print_a3_portrait: { label: 'Cartel A3 vertical', widthPt: 842, heightPt: 1191 },
  social_feed_square: { label: 'Feed cuadrado', widthPt: 1080, heightPt: 1080 },
  social_feed_portrait: { label: 'Feed vertical', widthPt: 1080, heightPt: 1350 },
  social_story: { label: 'Story', widthPt: 1080, heightPt: 1920 },
}

const ASSET_TOKENS = ['asset.title', 'asset.price', 'asset.location', 'asset.description', 'asset.bedrooms', 'asset.bathrooms', 'asset.builtArea', 'asset.propertyType', 'asset.publicUrl']
const IMAGE_TOKENS = ['asset.mainImage', 'asset.masterPlanImage', 'asset.locationMapImage', 'tenant.logo']
const QR_TOKENS = ['asset.qrCode']
const TENANT_TOKENS = ['tenant.phone', 'tenant.whatsapp', 'tenant.email', 'tenant.legalText', 'tenant.website']

const props = defineProps<{ structure: TemplateStructure; formatKey: string }>()
const structure = props.structure // mutated in place — parent holds the reactive object and reads it back on save

const format = computed(() => FORMATS[props.formatKey] || FORMATS.pdf_a4_portrait)
const DISPLAY_WIDTH = 460
const scale = computed(() => DISPLAY_WIDTH / format.value.widthPt)
const canvasWidth = computed(() => Math.round(format.value.widthPt * scale.value))
const canvasHeight = computed(() => Math.round(format.value.heightPt * scale.value))

const activePageIndex = ref(0)
const activePage = computed(() => structure.pages[activePageIndex.value] || structure.pages[0])
const selected = ref<string | null>(null)
const selectedElement = computed(() => activePage.value?.elements.find((e) => e.id === selected.value) || null)

function tokensFor(type: string) {
  if (type === 'image') return IMAGE_TOKENS
  if (type === 'qr') return QR_TOKENS
  return [...ASSET_TOKENS, ...TENANT_TOKENS]
}

function styleOf(el: TemplateElement) {
  if (!el.style) el.style = {}
  return el.style
}

const boldModel = computed({
  get: () => (selectedElement.value ? Number(styleOf(selectedElement.value).weight) >= 600 : false),
  set: (v: boolean) => {
    if (selectedElement.value) styleOf(selectedElement.value).weight = v ? 700 : 400
  },
})
const lockedModel = computed({
  get: () => !!selectedElement.value?.locked,
  set: (v: boolean) => {
    if (selectedElement.value) selectedElement.value.locked = v
  },
})

function elementStyle(el: TemplateElement) {
  return {
    left: `${el.x * scale.value}px`,
    top: `${el.y * scale.value}px`,
    width: `${el.w * scale.value}px`,
    height: `${el.h * scale.value}px`,
  }
}

let idSeq = 1
function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${idSeq++}`
}

function addElement(type: 'text' | 'image' | 'qr') {
  const defaults = { text: { w: 200, h: 24 }, image: { w: 150, h: 150 }, qr: { w: 90, h: 90 } }[type]
  const el: TemplateElement = { id: newId(type), type, x: 40, y: 40, ...defaults, binding: type === 'text' ? '' : type === 'qr' ? '{{asset.qrCode}}' : '{{asset.mainImage}}' }
  activePage.value.elements.push(el)
  selected.value = el.id
}

function removeElement() {
  if (!selectedElement.value) return
  const idx = activePage.value.elements.findIndex((e) => e.id === selectedElement.value!.id)
  if (idx >= 0) activePage.value.elements.splice(idx, 1)
  selected.value = null
}

function addPage() {
  structure.pages.push({ id: newId('page'), elements: [] })
  activePageIndex.value = structure.pages.length - 1
}
function removePage(i: number) {
  structure.pages.splice(i, 1)
  activePageIndex.value = Math.min(activePageIndex.value, structure.pages.length - 1)
}
function movePage(i: number, delta: number) {
  const target = i + delta
  if (target < 0 || target >= structure.pages.length) return
  const [page] = structure.pages.splice(i, 1)
  structure.pages.splice(target, 0, page)
  if (activePageIndex.value === i) activePageIndex.value = target
}
function duplicatePage(i: number) {
  const source = structure.pages[i]
  const clone: TemplatePage = { id: newId('page'), elements: source.elements.map((el) => ({ ...el, id: newId(el.type), style: el.style ? { ...el.style } : undefined })) }
  structure.pages.splice(i + 1, 0, clone)
  activePageIndex.value = i + 1
}

// Pointer-based drag/resize — no external library, just mouse deltas
// converted through the same scale factor used for layout.
let dragging: { el: TemplateElement; startX: number; startY: number; origX: number; origY: number } | null = null
let resizing: { el: TemplateElement; startX: number; startY: number; origW: number; origH: number } | null = null

function startDrag(e: MouseEvent, el: TemplateElement) {
  selected.value = el.id
  if (el.locked) return
  dragging = { el, startX: e.clientX, startY: e.clientY, origX: el.x, origY: el.y }
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}
function startResize(e: MouseEvent, el: TemplateElement) {
  if (el.locked) return
  resizing = { el, startX: e.clientX, startY: e.clientY, origW: el.w, origH: el.h }
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}
function onMouseMove(e: MouseEvent) {
  if (dragging) {
    const dx = (e.clientX - dragging.startX) / scale.value
    const dy = (e.clientY - dragging.startY) / scale.value
    dragging.el.x = Math.max(0, Math.round(dragging.origX + dx))
    dragging.el.y = Math.max(0, Math.round(dragging.origY + dy))
  } else if (resizing) {
    const dx = (e.clientX - resizing.startX) / scale.value
    const dy = (e.clientY - resizing.startY) / scale.value
    resizing.el.w = Math.max(10, Math.round(resizing.origW + dx))
    resizing.el.h = Math.max(10, Math.round(resizing.origH + dy))
  }
}
function onMouseUp() {
  dragging = null
  resizing = null
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
}

// --- Undo/redo ---------------------------------------------------------
// A debounced deep watch on `structure` (rather than a manual snapshot()
// call at every mutation site) means one undo step per burst of activity —
// a whole drag gesture or a run of keystrokes in a text field — instead of
// one step per pixel moved or per character typed, which is how every
// mainstream editor's undo actually behaves. History holds plain JSON
// strings (the structure is plain serializable data, no functions/dates),
// so `structuredClone`-equivalent deep copies are just JSON.stringify/parse.
const MAX_HISTORY = 50
const history: string[] = []
const future: string[] = []
let lastSnapshot = JSON.stringify(structure)
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let suppressWatch = false

const canUndo = computed(() => history.length > 0)
const canRedo = computed(() => future.length > 0)

function commitPendingSnapshot() {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  const current = JSON.stringify(structure)
  if (current === lastSnapshot) return
  history.push(lastSnapshot)
  if (history.length > MAX_HISTORY) history.shift()
  future.length = 0
  lastSnapshot = current
}

watch(
  structure,
  () => {
    if (suppressWatch) return
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(commitPendingSnapshot, 500)
  },
  { deep: true },
)

function applySnapshot(json: string) {
  suppressWatch = true
  const parsed = JSON.parse(json) as TemplateStructure
  structure.pages.splice(0, structure.pages.length, ...parsed.pages)
  lastSnapshot = json
  selected.value = null
  activePageIndex.value = Math.min(activePageIndex.value, structure.pages.length - 1)
  nextTick(() => {
    suppressWatch = false
  })
}

function undo() {
  commitPendingSnapshot()
  if (!history.length) return
  future.push(lastSnapshot)
  applySnapshot(history.pop()!)
}
function redo() {
  if (!future.length) return
  history.push(lastSnapshot)
  applySnapshot(future.pop()!)
}

function onKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null
  // Let native undo run inside text inputs — only drive the canvas
  // undo/redo stack when focus is elsewhere (canvas, buttons, body).
  if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
  e.preventDefault()
  if (e.shiftKey) redo()
  else undo()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
  window.removeEventListener('keydown', onKeydown)
  if (debounceTimer) clearTimeout(debounceTimer)
})
</script>

<style scoped>
.palette-btn {
  @apply block w-full rounded-lg border border-line px-2 py-1.5 text-left text-xs hover:bg-stone-50;
}
.prop-input {
  @apply w-full rounded-lg border border-line bg-white px-2 py-1.5 text-xs focus:border-ink;
}
</style>
