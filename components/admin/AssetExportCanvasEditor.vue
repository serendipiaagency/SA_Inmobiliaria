<template>
  <div :class="fullscreen ? 'fixed inset-0 z-[70] flex flex-col gap-3 overflow-auto bg-white p-3' : 'flex flex-col gap-3'">
    <!-- Barra de herramientas: paneles, zoom y pantalla completa -->
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
      <div class="flex items-center gap-1.5">
        <button type="button" class="tb-btn" :class="showPalette ? 'tb-on' : ''" title="Mostrar/ocultar Elementos" @click="showPalette = !showPalette">Elementos</button>
        <button type="button" class="tb-btn" :class="showInspector ? 'tb-on' : ''" title="Mostrar/ocultar Propiedades" @click="showInspector = !showInspector">Propiedades</button>
      </div>
      <div class="flex items-center gap-1">
        <button type="button" class="tb-btn" title="Alejar" @click="zoomBy(-0.25)">−</button>
        <span class="w-12 text-center text-xs tabular-nums text-stone-500">{{ Math.round(scale * 100) }}%</span>
        <button type="button" class="tb-btn" title="Acercar" @click="zoomBy(0.25)">+</button>
        <button type="button" class="tb-btn" title="Ajustar a pantalla" @click="zoomFit">Ajustar</button>
        <button type="button" class="tb-btn" title="Tamaño real" @click="zoom100">100%</button>
        <button type="button" class="tb-btn" :title="fullscreen ? 'Salir de pantalla completa (Esc)' : 'Pantalla completa'" @click="fullscreen = !fullscreen">{{ fullscreen ? '🗗 Reducir' : '⛶ Ampliar' }}</button>
      </div>
    </div>

    <!-- Fila principal: paleta · lienzo · propiedades -->
    <div class="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
      <!-- Left: element palette -->
      <div v-show="showPalette" class="w-full shrink-0 space-y-2 lg:w-36">
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
      <!-- Datos de previsualización: muestra el documento con una propiedad real. -->
      <div class="mx-auto mb-3 flex max-w-[460px] flex-wrap items-center gap-2 text-[11px]">
        <template v-if="preview">
          <span class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
            <span class="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Previsualización: {{ previewName }}
          </span>
          <button type="button" class="text-stone-500 hover:text-ink hover:underline" @click="pickerOpen = true">Cambiar</button>
          <button type="button" class="text-stone-500 hover:text-ink hover:underline" @click="clearPreview">Quitar</button>
        </template>
        <template v-else>
          <span class="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
            <span class="h-1.5 w-1.5 rounded-full bg-amber-500" /> Propiedad de demostración
          </span>
          <button type="button" class="font-medium text-ink hover:underline" @click="pickerOpen = true">Previsualizar con una propiedad real</button>
        </template>
      </div>

      <div
        ref="canvasEl"
        class="relative mx-auto bg-white shadow-md"
        :style="{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }"
        @mousedown="selected = null"
      >
        <div
          v-for="el in activePage.elements"
          :key="el.id"
          class="absolute cursor-move"
          :class="selected === el.id ? 'outline outline-2 outline-ink' : 'outline-dashed outline-1 outline-stone-300/70'"
          :style="elementStyle(el)"
          @mousedown.stop="startDrag($event, el)"
        >
          <!-- Texto: con su tipografía, tamaño, peso, color y mayúsculas reales -->
          <div v-if="el.type === 'text'" class="pointer-events-none h-full w-full overflow-hidden" :style="textCss(el)">{{ textContent(el) }}</div>
          <!-- Imagen: la foto real de la propiedad si hay previsualización; si no, marcador legible -->
          <img v-else-if="el.type === 'image' && imgUrl(el)" :src="imgUrl(el)!" class="pointer-events-none h-full w-full object-cover" alt="" >
          <div v-else-if="el.type === 'image'" class="pointer-events-none flex h-full w-full items-center justify-center overflow-hidden bg-stone-100 px-1 text-center text-[9px] text-stone-400">🖼 {{ canvasLabel(el) }}</div>
          <!-- QR: marcador (el QR real se dibuja en el PDF) -->
          <div v-else class="pointer-events-none flex h-full w-full items-center justify-center bg-stone-800 text-[9px] text-white">▦ QR</div>

          <div v-if="selected === el.id" class="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-full border border-white bg-ink" @mousedown.stop="startResize($event, el)" />
        </div>
      </div>
      <p class="mt-2 text-center text-[11px] text-stone-400">{{ format.label }} — {{ format.widthPt }}×{{ format.heightPt }} pt</p>
    </div>

      <!-- Right: properties -->
      <div v-show="showInspector" class="w-full shrink-0 lg:w-64">
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

        <div class="block text-xs">
          <span class="mb-1 block text-stone-500">Vinculación de datos</span>
          <input v-model="bindingQuery" type="search" placeholder="Buscar campo… (ej. precio)" class="prop-input mb-1.5" >
          <select :value="bindingTokenValue" class="prop-input" @change="onBindingChange(($event.target as HTMLSelectElement).value)">
            <option value="">— texto fijo —</option>
            <optgroup v-for="g in bindingGroups" :key="g.group" :label="g.group">
              <option v-for="it in g.items" :key="it.token" :value="`{{${it.token}}}`">{{ it.label }}</option>
            </optgroup>
          </select>
          <p v-if="isBindingToken(selectedElement.binding)" class="mt-1 leading-snug text-[11px] text-stone-400">
            Campo dinámico: <span class="font-medium text-stone-600">{{ tokenLabel(selectedElement.binding) }}</span>. Se rellena con los datos reales de la propiedad.
          </p>
        </div>
        <label v-if="selectedElement.type === 'text' && !isBindingToken(selectedElement.binding)" class="block text-xs">
          <span class="mb-1 block text-stone-500">Texto fijo</span>
          <input v-model="selectedElement.binding" class="prop-input" placeholder="Escribe un texto fijo" >
        </label>

        <template v-if="selectedElement.type === 'text'">
          <label class="block text-xs">
            <span class="mb-1 block text-stone-500">Tamaño de fuente</span>
            <input v-model.number="styleOf(selectedElement).fontSize" type="number" class="prop-input" >
          </label>
          <label class="flex items-center gap-2 text-xs">
            <input v-model="boldModel" type="checkbox" > Negrita
          </label>
          <div class="block text-xs">
            <span class="mb-1 block text-stone-500">Color</span>
            <AdminAssetExportColorPicker :model-value="(styleOf(selectedElement).color as string) || ''" :brand-colors="brandColors" @update:model-value="setColor" />
          </div>
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

    <AdminCommsPropertyPickerModal v-if="pickerOpen" title="Previsualizar con una propiedad" @close="pickerOpen = false" @pick="onPickPreview" />
  </div>
</template>

<script setup lang="ts">
import { isBindingToken, tokenGroupsForKind, tokenLabel } from '~/utils/assetExport/tokenCatalog'
import { bindingsOrDemo } from '~/utils/assetExport/clientRender'

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
  print_a3_landscape: { label: 'Cartel A3 horizontal', widthPt: 1191, heightPt: 842 },
  social_feed_square: { label: 'Feed cuadrado', widthPt: 1080, heightPt: 1080 },
  social_feed_portrait: { label: 'Feed vertical', widthPt: 1080, heightPt: 1350 },
  social_story: { label: 'Story', widthPt: 1080, heightPt: 1920 },
}

const props = defineProps<{
  structure: TemplateStructure
  formatKey: string
  /** Propiedad vinculada (si la hay): el lienzo muestra sus datos reales. */
  previewProperty?: { kind: 'developer' | 'agent'; id: number; name?: string } | null
}>()
const structure = props.structure // mutated in place — parent holds the reactive object and reads it back on save

const format = computed(() => FORMATS[props.formatKey] || FORMATS.pdf_a4_portrait)
const DISPLAY_WIDTH = 460

// --- Espacio de trabajo: zoom, pantalla completa y paneles contraíbles ------
const fullscreen = ref(false)
const showPalette = ref(true)
const showInspector = ref(true)
// `zoom` = 1 → el documento se ajusta a DISPLAY_WIDTH; >1 agranda (con scroll).
const zoom = ref(1)
const baseScale = computed(() => DISPLAY_WIDTH / format.value.widthPt)
const scale = computed(() => baseScale.value * zoom.value)
const canvasWidth = computed(() => Math.round(format.value.widthPt * scale.value))
const canvasHeight = computed(() => Math.round(format.value.heightPt * scale.value))
function zoomBy(delta: number) {
  zoom.value = Math.min(4, Math.max(0.2, Math.round((zoom.value + delta) * 100) / 100))
}
function zoomFit() {
  zoom.value = 1
}
function zoom100() {
  // Tamaño real (1 px por punto): scale = 1 → zoom = 1 / baseScale.
  zoom.value = 1 / baseScale.value
}

const activePageIndex = ref(0)
const activePage = computed(() => structure.pages[activePageIndex.value] || structure.pages[0])
const selected = ref<string | null>(null)
const selectedElement = computed(() => activePage.value?.elements.find((e) => e.id === selected.value) || null)

// --- Vinculación de datos (nombres legibles, agrupados y buscables) ---------
// Los tokens técnicos (asset.title…) NO cambian; sólo su etiqueta visible, vía
// utils/assetExport/tokenCatalog. El buscador y los grupos salen de ahí.
const bindingQuery = ref('')
const bindingGroups = computed(() => (selectedElement.value ? tokenGroupsForKind(selectedElement.value.type, bindingQuery.value) : []))
const bindingTokenValue = computed(() => (selectedElement.value && isBindingToken(selectedElement.value.binding) ? selectedElement.value.binding! : ''))
function onBindingChange(val: string) {
  // Cambiar el origen de datos NO toca el estilo del elemento.
  if (selectedElement.value) selectedElement.value.binding = val
}
// Al cambiar de elemento, limpiar el buscador para no arrastrar el filtro anterior.
watch(selected, () => {
  bindingQuery.value = ''
})
// --- Selector de color (Brand Kit + HEX libre) ------------------------------
// Los colores de marca se cargan una vez para mostrarlos como muestras reales;
// sin Brand Kit el selector sigue funcionando con HEX y predefinidos.
type BrandColors = { colorPrimary?: string | null; colorSecondary?: string | null; colorBackground?: string | null; colorText?: string | null }
const brandColors = ref<BrandColors | null>(null)
onMounted(async () => {
  try {
    brandColors.value = await $fetch<BrandColors | null>('/api/admin/asset-export/brand-kit')
  } catch {
    /* sin Brand Kit o sin permiso: el selector funciona igual con HEX/predefinidos */
  }
})
function setColor(v: string) {
  if (!selectedElement.value) return
  const s = styleOf(selectedElement.value)
  // Guardar el rol o el HEX; «» vuelve al color por defecto (se quita la clave).
  if (v) s.color = v
  else delete s.color
}

/** Etiqueta legible que se muestra DENTRO del bloque en el lienzo. */
function canvasLabel(el: TemplateElement) {
  if (el.type === 'qr') return 'QR'
  if (isBindingToken(el.binding)) return tokenLabel(el.binding)
  if (el.type === 'text') return el.binding || '(texto vacío)'
  return el.binding ? tokenLabel(el.binding) : 'Imagen'
}

// --- Previsualización con datos reales --------------------------------------
// El lienzo puede mostrar el documento con los datos REALES de una propiedad
// (los mismos que resuelve la exportación), en vez de nombres de campo. La
// propiedad puede venir vinculada (prop) o elegirse aquí; sin ninguna, se ven
// los nombres de campo como ejemplo (nunca datos inventados).
const preview = ref<{ values: Record<string, string>; images: Record<string, string | null> } | null>(null)
const previewName = ref('')
const pickerOpen = ref(false)

async function loadPreview(kind: 'developer' | 'agent', id: number, name?: string) {
  const assetKind = kind === 'agent' ? 'agent_property' : 'developer_property'
  try {
    preview.value = await $fetch<{ values: Record<string, string>; images: Record<string, string | null> }>('/api/admin/asset-export/preview-bindings', { query: { assetKind, assetId: id } })
    previewName.value = name || `#${id}`
  } catch {
    preview.value = null
    previewName.value = ''
  }
}
function onPickPreview(p: { kind: 'developer' | 'agent'; id: number; name?: string }) {
  pickerOpen.value = false
  loadPreview(p.kind, p.id, p.name)
}
function clearPreview() {
  preview.value = null
  previewName.value = ''
}
onMounted(() => {
  if (props.previewProperty) loadPreview(props.previewProperty.kind, props.previewProperty.id, props.previewProperty.name)
})

// Datos activos del lienzo: la propiedad REAL si hay previsualización elegida;
// si no, la propiedad de demostración (utils/assetExport/demoProperty.ts), para
// que el documento se vea con contenido realista en vez de nombres de campo. La
// demo vive sólo en el cliente y nunca llega a una exportación real.
const activeBindings = computed(() => bindingsOrDemo(preview.value))

function tokenOf(binding: string | undefined): string | null {
  const m = binding?.match(/^\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}$/)
  return m ? m[1] : null
}
/** Texto que se pinta en el bloque: valor (real o de demo) si lo hay, si no la etiqueta/el texto fijo. */
function textContent(el: TemplateElement): string {
  const token = tokenOf(el.binding)
  if (token) {
    const v = activeBindings.value.values[token]
    if (v) return el.style?.uppercase ? v.toUpperCase() : v
    return tokenLabel(el.binding) // sin dato: nombre del campo, no {{token}}
  }
  return el.binding || '' // texto fijo
}
/** URL de la foto (real o de demo) para un bloque de imagen. */
function imgUrl(el: TemplateElement): string | null {
  const token = tokenOf(el.binding)
  return token ? activeBindings.value.images[token] || null : null
}
// Color CSS que imita resolveColor del servidor: rol de marca → color del Brand
// Kit (real o de demo) o su defecto; HEX → tal cual.
const ROLE_FALLBACK: Record<string, string> = { primary: '#141410', secondary: '#66593a', background: '#ffffff', text: '#141410', accent: '#66593a', muted: '#73706c' }
const ROLE_TOKEN: Record<string, string> = { primary: 'tenant.primaryColor', secondary: 'tenant.secondaryColor', background: 'tenant.backgroundColor', text: 'tenant.textColor', accent: 'tenant.accentColor' }
function resolveCssColor(color: unknown): string {
  if (typeof color !== 'string' || !color) return '#141410'
  if (ROLE_TOKEN[color]) return activeBindings.value.values[ROLE_TOKEN[color]] || ROLE_FALLBACK[color]
  if (color === 'muted') return ROLE_FALLBACK.muted
  return color // HEX
}
/** Estilo CSS del texto, a escala del lienzo, reflejando lo que hará el PDF. */
function textCss(el: TemplateElement) {
  const s = el.style || {}
  return {
    fontSize: `${(Number(s.fontSize) || 12) * scale.value}px`,
    fontWeight: Number(s.weight) >= 600 ? 700 : 400,
    color: resolveCssColor(s.color),
    lineHeight: String(Number(s.lineHeight) || 1.3),
    textTransform: s.uppercase ? 'uppercase' : 'none',
    padding: '1px 2px',
    wordBreak: 'break-word' as const,
  }
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
  // Esc sale de pantalla completa (aunque el foco esté en un campo).
  if (e.key === 'Escape' && fullscreen.value) {
    fullscreen.value = false
    return
  }
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
.tb-btn {
  @apply rounded-md border border-line px-2 py-1 text-xs font-medium text-stone-600 transition hover:bg-stone-50;
}
.tb-on {
  @apply border-ink bg-stone-50 text-ink;
}
</style>
