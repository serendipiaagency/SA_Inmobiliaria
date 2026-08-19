<template>
  <div class="flex h-screen flex-col bg-stone-100">
    <!-- Toolbar -->
    <header class="flex h-14 shrink-0 items-center justify-between border-b border-line bg-white px-4">
      <div class="flex items-center gap-3">
        <NuxtLink to="/admin/developer-properties" class="text-stone-400 hover:text-ink" aria-label="Volver">
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 18l-6-6 6-6" /></svg>
        </NuxtLink>
        <div>
          <p class="text-sm font-semibold text-ink">Constructor Web</p>
          <p class="text-[11px] text-stone-400">Página de inicio</p>
        </div>
      </div>

      <div class="flex items-center gap-1 rounded-full bg-stone-100 p-1">
        <button
          v-for="d in DEVICES"
          :key="d.key"
          type="button"
          class="rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition"
          :class="device === d.key ? 'bg-white text-ink shadow' : 'text-stone-400 hover:text-ink'"
          :title="d.label"
          @click="device = d.key"
        >
          {{ d.short }}
        </button>
      </div>

      <div class="flex items-center gap-2">
        <span class="mr-1 text-[11px] text-stone-400">{{ saveStateLabel }}</span>
        <button type="button" class="toolbar-btn" :disabled="!canUndo" title="Deshacer" @click="undo">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7v6h6M3 13a9 9 0 1 0 3-6.7L3 9" /></svg>
        </button>
        <button type="button" class="toolbar-btn" :disabled="!canRedo" title="Rehacer" @click="redo">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 7v6h-6M21 13a9 9 0 1 1-3-6.7L21 9" /></svg>
        </button>
        <button
          type="button"
          class="toolbar-btn"
          :class="previewMode ? '!bg-ink !text-white' : ''"
          title="Vista previa"
          @click="previewMode = !previewMode"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
        </button>
        <a :href="`/demo?preview=${pageVersion}`" target="_blank" rel="noopener" class="toolbar-btn" title="Abrir sitio publicado">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" /></svg>
        </a>
        <button type="button" class="toolbar-btn" title="SEO de la página" @click="seoOpen = true">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8" /><path stroke-linecap="round" d="m21 21-4.3-4.3" /></svg>
        </button>
        <button
          type="button"
          class="dash-btn-primary"
          :disabled="publishing"
          @click="publish"
        >
          {{ publishing ? 'Publicando…' : hasUnpublishedChanges ? 'Publicar cambios' : 'Publicado' }}
        </button>
      </div>
    </header>

    <div class="flex min-h-0 flex-1">
      <!-- Left panel: structure -->
      <aside
        v-if="!previewMode"
        class="flex shrink-0 flex-col overflow-hidden border-r border-line bg-white transition-[width] duration-200 ease-out"
        :class="structureCollapsed ? 'w-11' : 'w-72'"
      >
        <div class="flex h-11 shrink-0 items-center border-b border-line" :class="structureCollapsed ? 'justify-center px-0' : 'justify-between px-4'">
          <p v-show="!structureCollapsed" class="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-stone-500">Estructura</p>
          <div class="flex shrink-0 items-center gap-2">
            <button v-show="!structureCollapsed" type="button" class="whitespace-nowrap text-[11px] font-semibold text-ink underline" @click="libraryOpen = true">+ Añadir bloque</button>
            <button
              type="button"
              class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-stone-400 transition hover:bg-stone-100 hover:text-ink"
              :title="structureCollapsed ? 'Expandir estructura' : 'Contraer estructura'"
              :aria-expanded="!structureCollapsed"
              @click="toggleStructureCollapsed"
            >
              <svg class="h-3.5 w-3.5 transition-transform duration-200" :class="structureCollapsed ? 'rotate-180' : ''" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          </div>
        </div>
        <ul v-show="!structureCollapsed" ref="structureListEl" class="flex-1 overflow-y-auto p-2">
          <li
            v-for="(block, i) in blocks"
            :key="block.id"
            draggable="true"
            class="group mb-1 flex cursor-grab items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition"
            :class="[
              selectedBlockId === block.id ? 'border-ink bg-paper' : 'border-transparent hover:bg-stone-50',
              dragOverId === block.id ? 'border-dashed border-blue-400' : '',
            ]"
            @click="selectedBlockId = block.id"
            @dragstart="onDragStart(i)"
            @dragover.prevent="dragOverId = block.id"
            @dragleave="dragOverId === block.id && (dragOverId = null)"
            @drop="onDrop(i)"
          >
            <svg class="h-3.5 w-3.5 shrink-0 text-stone-300" viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="6" r="1.4" /><circle cx="8" cy="12" r="1.4" /><circle cx="8" cy="18" r="1.4" /><circle cx="16" cy="6" r="1.4" /><circle cx="16" cy="12" r="1.4" /><circle cx="16" cy="18" r="1.4" /></svg>
            <span class="flex-1 truncate" :class="isHiddenOnDevice(block) ? 'text-stone-300 line-through' : ''">{{ blockLabel(block.type) }}</span>
            <button type="button" class="shrink-0 text-stone-300 opacity-0 hover:text-ink group-hover:opacity-100" title="Ocultar en este dispositivo" @click.stop="toggleHide(block)">
              <svg v-if="isHiddenOnDevice(block)" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a20.4 20.4 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" /></svg>
              <svg v-else class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
            </button>
            <button type="button" class="shrink-0 text-stone-300 opacity-0 hover:text-ink group-hover:opacity-100" title="Duplicar" @click.stop="duplicateBlock(block.id)">
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
            </button>
            <button type="button" class="shrink-0 text-stone-300 opacity-0 hover:text-red-500 group-hover:opacity-100" title="Eliminar" @click.stop="deleteBlock(block.id)">
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16z" /></svg>
            </button>
          </li>
        </ul>
      </aside>

      <!-- Canvas -->
      <main class="flex flex-1 justify-center overflow-auto bg-stone-200 py-8">
        <div class="shrink-0 overflow-hidden rounded-xl bg-white shadow-2xl transition-[width] duration-200" :style="{ width: DEVICE_WIDTH[device] + 'px', height: 'calc(100vh - 7.5rem)' }">
          <iframe ref="iframeEl" src="/admin/site-builder/canvas" class="h-full w-full border-0" title="Vista previa del Constructor Web" />
        </div>
      </main>

      <!-- Right panel: contextual editor -->
      <aside v-if="!previewMode && selectedBlock" class="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-line bg-white p-4" @focusin="onPanelFocusIn" @focusout="onPanelFocusOut">
        <div class="mb-4 flex items-center justify-between">
          <p class="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{{ blockLabel(selectedBlock.type) }}</p>
          <button type="button" class="text-stone-300 hover:text-ink" @click="selectedBlockId = null">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <component :is="editorFor(selectedBlock.type)" v-model:content="selectedBlock.content" />

        <div class="mt-6 border-t border-line pt-4">
          <p class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500">Visible en</p>
          <div class="flex gap-3">
            <label v-for="d in DEVICES" :key="d.key" class="flex items-center gap-1.5 text-xs text-stone-600">
              <input type="checkbox" :checked="!isHiddenOnDevice(selectedBlock, d.key)" @change="setVisible(selectedBlock, d.key, ($event.target as HTMLInputElement).checked)" />
              {{ d.label }}
            </label>
          </div>
        </div>
      </aside>
      <aside v-else-if="!previewMode" class="flex w-80 shrink-0 items-center justify-center border-l border-line bg-white p-6 text-center text-sm text-stone-400">
        Selecciona un bloque en el lienzo o en la estructura para editarlo.
      </aside>
    </div>

    <!-- Block library -->
    <div v-if="libraryOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" @click.self="libraryOpen = false">
      <div class="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div class="mb-4 flex items-center justify-between">
          <p class="text-lg font-serif">Añadir bloque</p>
          <button type="button" class="text-stone-300 hover:text-ink" @click="libraryOpen = false">
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div v-for="cat in BLOCK_CATEGORIES" :key="cat" class="mb-6">
          <p class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-400">{{ cat }}</p>
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="preset in presetsByCategory[cat]"
              :key="preset.presetId"
              type="button"
              class="rounded-xl border border-line p-3 text-left transition hover:border-ink hover:bg-paper"
              @click="addBlock(preset)"
            >
              <p class="text-sm font-semibold text-ink">{{ preset.label }}</p>
              <p class="mt-0.5 text-[12px] text-stone-500">{{ preset.description }}</p>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- SEO -->
    <div v-if="seoOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" @click.self="seoOpen = false">
      <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div class="mb-4 flex items-center justify-between">
          <p class="text-lg font-serif">SEO de la página</p>
          <button type="button" class="text-stone-300 hover:text-ink" @click="seoOpen = false">
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <label class="mb-3 block">
          <span class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-stone-500">Título</span>
          <input v-model="seo.title" class="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink focus:outline-none" maxlength="200" />
        </label>
        <label class="block">
          <span class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-stone-500">Descripción</span>
          <textarea v-model="seo.description" class="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink focus:outline-none" rows="3" maxlength="500" />
        </label>
        <p class="mt-3 text-[11px] text-stone-400">Se guarda con el resto de la página y se publica al pulsar "Publicar cambios".</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SiteBlock } from '~/server/utils/sitePages'
import { BLOCK_PRESETS, BLOCK_CATEGORIES, blockLabel, newBlockId, type BlockPreset } from '~/composables/useSiteBuilderRegistry'
import HeroEditor from '~/components/site-builder/editors/HeroEditor.vue'
import MapTeaserEditor from '~/components/site-builder/editors/MapTeaserEditor.vue'
import PropertiesEditor from '~/components/site-builder/editors/PropertiesEditor.vue'
import CommunitiesEditor from '~/components/site-builder/editors/CommunitiesEditor.vue'
import PropertyTypesEditor from '~/components/site-builder/editors/PropertyTypesEditor.vue'
import MortgageEditor from '~/components/site-builder/editors/MortgageEditor.vue'
import BlogListEditor from '~/components/site-builder/editors/BlogListEditor.vue'

definePageMeta({ layout: false, middleware: 'admin' })

const toast = useToast()
const { confirm } = useConfirm()

const DEVICES = [
  { key: 'desktop' as const, label: 'Escritorio', short: 'PC' },
  { key: 'tablet' as const, label: 'Tablet', short: 'Tab' },
  { key: 'mobile' as const, label: 'Móvil', short: 'Móvil' },
]
const DEVICE_WIDTH: Record<string, number> = { desktop: 1440, tablet: 834, mobile: 390 }

const blocks = ref<SiteBlock[]>([])
const seo = reactive({ title: '', description: '' })
const device = ref<'desktop' | 'tablet' | 'mobile'>('desktop')
const selectedBlockId = ref<string | null>(null)
const previewMode = ref(false)
const libraryOpen = ref(false)
const seoOpen = ref(false)
const dragOverId = ref<string | null>(null)

// Session-only UI preference (not page state): read after mount to avoid an
// SSR/client hydration mismatch, same pattern as useFavorites()/useCompare().
// The list itself stays mounted (v-show, not v-if) so collapsing never loses
// scroll position, selection, or block order, and never touches the canvas.
const STRUCTURE_COLLAPSED_KEY = 'sa-builder-structure-collapsed'
const structureCollapsed = ref(false)
const structureListEl = ref<HTMLElement | null>(null)
let structureScrollTop = 0

function toggleStructureCollapsed() {
  if (!structureCollapsed.value) structureScrollTop = structureListEl.value?.scrollTop ?? 0
  structureCollapsed.value = !structureCollapsed.value
  if (import.meta.client) sessionStorage.setItem(STRUCTURE_COLLAPSED_KEY, structureCollapsed.value ? '1' : '0')
  if (!structureCollapsed.value) {
    nextTick(() => {
      if (structureListEl.value) structureListEl.value.scrollTop = structureScrollTop
    })
  }
}
const pageVersion = ref(0)
const hasUnpublishedChanges = ref(false)
const publishing = ref(false)

const selectedBlock = computed(() => blocks.value.find((b) => b.id === selectedBlockId.value) || null)
const presetsByCategory = computed(() => {
  const map: Record<string, BlockPreset[]> = {}
  for (const cat of BLOCK_CATEGORIES) map[cat] = BLOCK_PRESETS.filter((p) => p.category === cat)
  return map
})

const EDITORS: Record<string, any> = {
  hero: HeroEditor,
  'map-teaser': MapTeaserEditor,
  properties: PropertiesEditor,
  communities: CommunitiesEditor,
  'property-types': PropertyTypesEditor,
  'mortgage-calculator': MortgageEditor,
  'blog-list': BlogListEditor,
}
function editorFor(type: string) {
  return EDITORS[type] || null
}

function isHiddenOnDevice(block: SiteBlock, d: 'desktop' | 'tablet' | 'mobile' = device.value) {
  return block.visibility?.[d] === false
}
function setVisible(block: SiteBlock, d: 'desktop' | 'tablet' | 'mobile', visible: boolean) {
  pushUndo()
  block.visibility = { ...block.visibility, [d]: visible }
}
function toggleHide(block: SiteBlock) {
  setVisible(block, device.value, isHiddenOnDevice(block))
}

// ---------------------------------------------------------------------------
// Undo/redo — session-only, in-memory. A snapshot is pushed before a
// structural change (add/delete/duplicate/reorder/visibility) and once per
// "edit burst" in the right panel (see onPanelFocusIn), never per keystroke.
// ---------------------------------------------------------------------------
const undoStack: string[] = []
const redoStack: string[] = []
const canUndo = ref(false)
const canRedo = ref(false)
const MAX_HISTORY = 50

function snapshot() {
  return JSON.stringify(blocks.value)
}
function pushUndo() {
  undoStack.push(snapshot())
  if (undoStack.length > MAX_HISTORY) undoStack.shift()
  redoStack.length = 0
  canUndo.value = true
  canRedo.value = false
}
function undo() {
  if (!undoStack.length) return
  redoStack.push(snapshot())
  blocks.value = JSON.parse(undoStack.pop()!)
  canUndo.value = undoStack.length > 0
  canRedo.value = true
}
function redo() {
  if (!redoStack.length) return
  undoStack.push(snapshot())
  blocks.value = JSON.parse(redoStack.pop()!)
  canRedo.value = redoStack.length > 0
  canUndo.value = true
}

let editBurstActive = false
let editBurstTimer: ReturnType<typeof setTimeout> | null = null
function onPanelFocusIn(e: FocusEvent) {
  if (!editBurstActive) {
    pushUndo()
    editBurstActive = true
  }
  if (editBurstTimer) clearTimeout(editBurstTimer)
}
function onPanelFocusOut(e: FocusEvent) {
  if (editBurstTimer) clearTimeout(editBurstTimer)
  const panel = (e.currentTarget as HTMLElement) || null
  editBurstTimer = setTimeout(() => {
    if (!panel || !panel.contains(document.activeElement)) editBurstActive = false
  }, 60)
}

// ---------------------------------------------------------------------------
// Block CRUD
// ---------------------------------------------------------------------------
function addBlock(preset: BlockPreset) {
  pushUndo()
  const block: SiteBlock = { id: newBlockId(preset.type), type: preset.type, version: 1, content: preset.createContent() }
  const insertAt = selectedBlockId.value ? blocks.value.findIndex((b) => b.id === selectedBlockId.value) + 1 : blocks.value.length
  blocks.value.splice(insertAt, 0, block)
  selectedBlockId.value = block.id
  libraryOpen.value = false
}
function duplicateBlock(id: string) {
  pushUndo()
  const idx = blocks.value.findIndex((b) => b.id === id)
  if (idx === -1) return
  const original = blocks.value[idx]
  const copy: SiteBlock = { ...JSON.parse(JSON.stringify(original)), id: newBlockId(original.type) }
  blocks.value.splice(idx + 1, 0, copy)
  selectedBlockId.value = copy.id
}
async function deleteBlock(id: string) {
  const ok = await confirm('Esta acción se puede deshacer con Ctrl+Z / el botón Deshacer, pero no se puede recuperar después de publicar.', {
    title: '¿Eliminar este bloque?',
    confirmLabel: 'Eliminar',
    danger: true,
  })
  if (!ok) return
  pushUndo()
  blocks.value = blocks.value.filter((b) => b.id !== id)
  if (selectedBlockId.value === id) selectedBlockId.value = null
}

let dragFromIndex: number | null = null
function onDragStart(i: number) {
  dragFromIndex = i
}
function onDrop(i: number) {
  dragOverId.value = null
  if (dragFromIndex === null || dragFromIndex === i) return
  pushUndo()
  const [moved] = blocks.value.splice(dragFromIndex, 1)
  blocks.value.splice(i, 0, moved)
  dragFromIndex = null
}

// ---------------------------------------------------------------------------
// Load / autosave / publish
// ---------------------------------------------------------------------------
const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const saveStateLabel = computed(() => ({ idle: '', saving: 'Guardando…', saved: 'Guardado', error: 'No se pudo guardar' }[saveState.value]))

let loaded = false
let saveTimer: ReturnType<typeof setTimeout> | null = null

interface DraftResponse {
  pageKey: string
  blocks: SiteBlock[]
  seo: { title?: string; description?: string }
  version: number
  publishedAt: string | null
  hasUnpublishedChanges: boolean
}

onMounted(async () => {
  structureCollapsed.value = sessionStorage.getItem(STRUCTURE_COLLAPSED_KEY) === '1'

  const data = await $fetch<DraftResponse>('/api/admin/site-pages/home')
  blocks.value = data.blocks as SiteBlock[]
  seo.title = data.seo?.title || ''
  seo.description = data.seo?.description || ''
  pageVersion.value = data.version || 0
  hasUnpublishedChanges.value = data.hasUnpublishedChanges
  loaded = true
})

watch(
  [blocks, seo],
  () => {
    if (!loaded) return
    hasUnpublishedChanges.value = true
    scheduleSave()
  },
  { deep: true },
)

function scheduleSave() {
  saveState.value = 'saving'
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    try {
      await $fetch<{ ok: true }>('/api/admin/site-pages/home', { method: 'PUT', body: { blocks: blocks.value, seo } })
      saveState.value = 'saved'
    } catch {
      saveState.value = 'error'
      toast.error('No se pudo guardar el borrador')
    }
  }, 1000)
}

async function publish() {
  publishing.value = true
  try {
    // Flush any pending autosave first so Publish never ships a stale draft.
    if (saveTimer) {
      clearTimeout(saveTimer)
      await $fetch('/api/admin/site-pages/home', { method: 'PUT', body: { blocks: blocks.value, seo } })
    }
    const res = await $fetch<{ ok: true; version: number }>('/api/admin/site-pages/home/publish', { method: 'POST' })
    pageVersion.value = res.version
    hasUnpublishedChanges.value = false
    saveState.value = 'saved'
    toast.success('Publicado')
  } catch {
    toast.error('No se pudo publicar')
  } finally {
    publishing.value = false
  }
}

// ---------------------------------------------------------------------------
// Canvas <iframe> bridge
// ---------------------------------------------------------------------------
const iframeEl = ref<HTMLIFrameElement | null>(null)
let canvasReady = false

function sendState() {
  if (!canvasReady) return
  iframeEl.value?.contentWindow?.postMessage(
    {
      source: 'sa-builder-shell',
      type: 'set-state',
      blocks: JSON.parse(JSON.stringify(blocks.value)),
      device: device.value,
      selectedBlockId: previewMode.value ? null : selectedBlockId.value,
      mode: previewMode.value ? 'preview' : 'builder',
    },
    window.location.origin,
  )
}
watch([blocks, device, selectedBlockId, previewMode], sendState, { deep: true })

function handleMessage(e: MessageEvent) {
  if (e.origin !== window.location.origin) return
  const msg = e.data
  if (!msg || msg.source !== 'sa-builder-canvas') return
  if (msg.type === 'ready') {
    canvasReady = true
    sendState()
  } else if (msg.type === 'select') {
    selectedBlockId.value = msg.id
  }
}
onMounted(() => window.addEventListener('message', handleMessage))
onUnmounted(() => window.removeEventListener('message', handleMessage))
</script>

<style scoped>
.toolbar-btn {
  @apply flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30;
}
.dash-btn-primary {
  @apply inline-flex items-center rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-white transition hover:bg-black disabled:opacity-50;
}
</style>
