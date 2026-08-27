<template>
  <div class="flex h-screen flex-col bg-stone-50">
    <TopBar
      :devices="DEVICES"
      :device="device"
      :save-state="saveState"
      :effective-zoom-percent="effectiveZoomPercent"
      :zoom-is-auto="zoomMode === 'auto'"
      :can-zoom-in="zoomMode !== 'auto' && zoomIndex < ZOOM_STEPS.length - 1"
      :can-zoom-out="zoomMode !== 'auto' && zoomIndex > 0"
      :can-undo="canUndo"
      :can-redo="canRedo"
      :preview-mode="previewMode"
      :published-site-url="publishedSiteUrl"
      :publishing="publishing"
      :has-unpublished-changes="hasUnpublishedChanges"
      @update:device="device = $event"
      @step-zoom="stepZoom"
      @zoom-auto="zoomMode = 'auto'"
      @undo="undo"
      @redo="redo"
      @toggle-preview="previewMode = !previewMode"
      @open-seo="seoOpen = true"
      @publish="publish"
    />

    <div class="flex min-h-0 flex-1">
      <!-- Left panel: structure -->
      <aside
        v-if="!previewMode"
        class="flex shrink-0 flex-col overflow-hidden border-r border-line bg-white transition-[width] duration-200 ease-out"
        :class="structureCollapsed ? 'w-11' : 'w-72'"
      >
        <div class="flex h-11 shrink-0 items-center border-b border-line" :class="structureCollapsed ? 'justify-center px-0' : 'justify-between px-4'">
          <p v-show="!structureCollapsed" class="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-stone-500">Estructura de la página</p>
          <div class="flex shrink-0 items-center gap-2">
            <button v-show="!structureCollapsed" type="button" class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-stone-400 transition hover:bg-stone-100 hover:text-ink" title="Añadir sección" @click="openLibraryAt(null)">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 5v14M5 12h14" /></svg>
            </button>
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

        <div v-show="!structureCollapsed" ref="structureListEl" class="flex-1 overflow-y-auto p-2">
          <template v-for="(block, i) in blocks" :key="block.id">
            <div class="group/gap relative z-20 h-2 -my-1">
              <div class="pointer-events-none absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 justify-center opacity-0 transition-opacity group-hover/gap:pointer-events-auto group-hover/gap:opacity-100">
                <button type="button" class="flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] font-semibold text-ink shadow-md transition hover:border-ink" @click="openLibraryAt(i)">
                  <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" d="M12 5v14M5 12h14" /></svg>
                  Añadir sección aquí
                </button>
              </div>
            </div>

            <div
              draggable="true"
              :data-block-row="block.id"
              class="group mb-1 flex cursor-grab items-start gap-2 rounded-lg border px-2.5 py-2 text-sm transition"
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
              <svg class="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-300" viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="6" r="1.4" /><circle cx="8" cy="12" r="1.4" /><circle cx="8" cy="18" r="1.4" /><circle cx="16" cy="6" r="1.4" /><circle cx="16" cy="12" r="1.4" /><circle cx="16" cy="18" r="1.4" /></svg>
              <div class="min-w-0 flex-1" :class="isHiddenOnDevice(block) ? 'opacity-40' : ''">
                <p class="truncate font-semibold text-ink">{{ pad2(i + 1) }} · {{ blockLabel(block.type) }}</p>
                <p class="truncate text-[12px] text-stone-450">{{ blockSubtitle(block) }}</p>
              </div>
              <div class="flex shrink-0 items-center gap-0.5">
                <button type="button" class="structure-icon-btn opacity-0 group-hover:opacity-100" title="Ocultar en este dispositivo" @click.stop="toggleHide(block)">
                  <svg v-if="isHiddenOnDevice(block)" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a20.4 20.4 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" /></svg>
                  <svg v-else class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                </button>
                <button type="button" class="structure-icon-btn opacity-0 group-hover:opacity-100" title="Duplicar" @click.stop="duplicateBlock(block.id)">
                  <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                </button>
                <button type="button" class="structure-icon-btn text-stone-300 opacity-0 hover:!text-red-500 group-hover:opacity-100" title="Eliminar" @click.stop="deleteBlock(block.id)">
                  <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16z" /></svg>
                </button>
              </div>
            </div>
          </template>

          <div class="group/gap relative z-20 h-2 -my-1">
            <div class="pointer-events-none absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 justify-center opacity-0 transition-opacity group-hover/gap:pointer-events-auto group-hover/gap:opacity-100">
              <button type="button" class="flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] font-semibold text-ink shadow-md transition hover:border-ink" @click="openLibraryAt(blocks.length)">
                <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" d="M12 5v14M5 12h14" /></svg>
                Añadir sección aquí
              </button>
            </div>
          </div>

          <button type="button" class="btn-quiet mt-3 w-full !py-2 !text-[11px]" @click="openLibraryAt(null)">+ Añadir sección</button>
        </div>

        <!-- Páginas: distinta de la Estructura (bloques de Inicio) — hoy solo
             Inicio es editable con el Constructor Web; el resto son páginas
             reales del sitio, gestionadas en sus propias secciones del panel,
             listadas aquí solo para orientar, no como CRUD que no existe. -->
        <div v-show="!structureCollapsed" class="shrink-0 border-t border-line p-3">
          <p class="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest text-stone-400">Páginas</p>
          <div class="flex items-center gap-2 rounded-lg bg-paper px-2.5 py-1.5 text-[13px] font-medium text-ink">
            <svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" /></svg>
            Inicio
          </div>
          <p
            v-for="p in OTHER_PAGES"
            :key="p"
            class="cursor-default truncate px-2.5 py-1.5 text-[13px] text-stone-400"
            title="Aún no es editable desde el Constructor Web"
          >
            {{ p }}
          </p>
        </div>
      </aside>

      <!-- Canvas -->
      <main ref="canvasMainEl" class="flex flex-1 items-start justify-center overflow-auto bg-stone-100 py-8">
        <div class="shrink-0" :style="{ width: outerWidthPx + 'px', height: outerHeightPx + 'px' }">
          <div
            class="origin-top-left overflow-hidden rounded-xl bg-white shadow-2xl"
            :style="{ width: DEVICE_WIDTH[device] + 'px', height: frameHeightPx + 'px', transform: `scale(${scale})` }"
          >
            <iframe ref="iframeEl" src="/admin/site-builder/canvas" class="h-full w-full border-0" title="Vista previa del Constructor Web" />
          </div>
        </div>
      </main>

      <!-- Right panel: Section library takes this slot while open (mutually
           exclusive with the Inspector — see docs/site-builder.md), then the
           Block Inspector, then its empty state. -->
      <aside v-if="libraryOpen" data-testid="section-library" class="flex w-96 shrink-0 flex-col overflow-hidden border-l border-line bg-white">
        <div class="shrink-0 border-b border-line p-4">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-base font-serif">Añadir sección</p>
              <p class="mt-0.5 text-[12px] text-stone-500">Elige y añade secciones profesionales a tu sitio inmobiliario.</p>
            </div>
            <button type="button" aria-label="Cerrar biblioteca de secciones" class="shrink-0 text-stone-300 hover:text-ink" @click="closeLibrary()">
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <div class="relative mt-3">
            <svg class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8" /><path stroke-linecap="round" d="m21 21-4.3-4.3" /></svg>
            <input v-model="librarySearch" type="text" placeholder="Buscar secciones..." class="input !py-2 !pl-9 !text-sm" />
          </div>
          <div class="mt-3 flex gap-1.5 overflow-x-auto pb-1">
            <button
              v-for="cat in LIBRARY_CATEGORIES"
              :key="cat"
              type="button"
              class="shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-[12px] font-medium transition"
              :class="libraryCategory === cat && !librarySearch ? 'border-ink bg-ink text-white' : 'border-line text-stone-500 hover:border-ink hover:text-ink'"
              @click="libraryCategory = cat; librarySearch = ''"
            >
              {{ cat }}
            </button>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-4">
          <template v-if="!librarySearch">
            <div v-if="favoritePresets.length" class="mb-5">
              <p class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-400">Favoritos</p>
              <div class="grid grid-cols-2 gap-2">
                <SectionCard v-for="preset in favoritePresets" :key="preset.presetId" :preset="preset" :favorite="true" @add="addBlock" @toggle-favorite="toggleFavorite" />
              </div>
            </div>
            <div v-if="recentPresets.length" class="mb-5">
              <p class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-400">Usados recientemente</p>
              <div class="grid grid-cols-2 gap-2">
                <SectionCard v-for="preset in recentPresets" :key="preset.presetId" :preset="preset" :favorite="favoritePresetIds.has(preset.presetId)" @add="addBlock" @toggle-favorite="toggleFavorite" />
              </div>
            </div>
          </template>

          <div>
            <p class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
              {{ librarySearch ? `Resultados para "${librarySearch}"` : libraryCategory }}
            </p>
            <div v-if="!filteredPresets.length" class="py-8 text-center text-sm text-stone-400">Sin resultados.</div>
            <div v-else class="grid grid-cols-2 gap-2">
              <SectionCard
                v-for="preset in filteredPresets"
                :key="preset.presetId"
                :preset="preset"
                :favorite="favoritePresetIds.has(preset.presetId)"
                @add="addBlock"
                @toggle-favorite="toggleFavorite"
              />
            </div>
          </div>
        </div>
      </aside>

      <!-- Right panel: Block Inspector -->
      <aside v-else-if="!previewMode && selectedBlock" class="flex w-96 shrink-0 flex-col overflow-y-auto border-l border-line bg-white p-4" @focusin="onPanelFocusIn" @focusout="onPanelFocusOut">
        <div class="mb-4 flex items-center justify-between">
          <p class="truncate text-[11px] font-semibold uppercase tracking-wide text-stone-500">{{ breadcrumb }}</p>
          <button type="button" class="shrink-0 text-stone-300 hover:text-ink" @click="selectedBlockId = null">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <component
          :is="inspectorFor(selectedBlock.type)?.component"
          v-if="inspectorFor(selectedBlock.type)"
          :content="selectedBlock.content"
          :projects="previewData?.projects || []"
          :communities="previewData?.communities || []"
        />
        <p v-else class="text-sm text-stone-400">Este tipo de bloque no tiene opciones adicionales todavía.</p>

        <InspectorSection title="Avanzado" :default-open="false">
          <CommonBlockSettings :block="selectedBlock" />
        </InspectorSection>
      </aside>
      <aside v-else-if="!previewMode" class="flex w-96 shrink-0 items-center justify-center border-l border-line bg-white p-6 text-center text-sm text-stone-400">
        Selecciona un bloque en el lienzo o en la estructura para editarlo.
      </aside>
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
import { BLOCK_PRESETS, BLOCK_CATEGORIES, BLOCK_INSPECTORS, RECOMMENDED_PRESET_IDS, blockLabel, blockSubtitle, newBlockId, type BlockPreset } from '~/composables/useSiteBuilderRegistry'
import InspectorSection from '~/components/site-builder/inspector/InspectorSection.vue'
import CommonBlockSettings from '~/components/site-builder/inspector/CommonBlockSettings.vue'
import TopBar from '~/components/site-builder/shell/TopBar.vue'
import SectionCard from '~/components/site-builder/shell/SectionCard.vue'

definePageMeta({ layout: false, middleware: 'admin' })

const toast = useToast()
const { confirm } = useConfirm()

// Real breakpoints, not arbitrary device-store presets: this project ships
// Tailwind's stock screens (tailwind.config.js has no `screens` override —
// sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536), and the site-builder's own
// blocks only ever branch on `sm:`/`lg:`. Desktop (1440) sits above `lg` so
// desktop styles win; tablet (768) is exactly the real `md` breakpoint value
// (previously 834, an arbitrary iPad-logical-width guess with no relation to
// any breakpoint this project actually uses); mobile (390) sits well below
// `sm` so mobile-first styles win.
const DEVICES = [
  { key: 'desktop' as const, label: 'Escritorio', short: 'PC' },
  { key: 'tablet' as const, label: 'Tablet', short: 'Tab' },
  { key: 'mobile' as const, label: 'Móvil', short: 'Móvil' },
]
const DEVICE_WIDTH: Record<string, number> = { desktop: 1440, tablet: 768, mobile: 390 }

const blocks = ref<SiteBlock[]>([])
const seo = reactive({ title: '', description: '' })
const device = ref<'desktop' | 'tablet' | 'mobile'>('desktop')
const selectedBlockId = ref<string | null>(null)
const previewMode = ref(false)
const libraryOpen = ref(false)
const seoOpen = ref(false)
const dragOverId = ref<string | null>(null)
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}
// Real routes this site already has — only "Inicio" is backed by site_pages
// today (server/utils/sitePages.ts hard-rejects any other pageKey), so the
// rest are listed for orientation, not as a page CRUD that doesn't exist yet.
const OTHER_PAGES = ['Propiedades', 'Ficha de propiedad', 'Nosotros', 'Servicios', 'Contacto', 'Blog']

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

// "/" only serves this org's published home on its own custom domain (see
// server/api/public/tenant.get.ts) — without one there's no public URL to
// open a preview of.
const { data: orgInfo } = await useFetch<any>('/api/admin/active-org-info')
const publishedSiteUrl = computed(() =>
  orgInfo.value?.domain ? `https://${orgInfo.value.domain}/?preview=${pageVersion.value}` : null,
)

const selectedBlock = computed(() => blocks.value.find((b) => b.id === selectedBlockId.value) || null)

// ---------------------------------------------------------------------------
// Section library — search/category filter, "recientes" and "favoritos"
// shelves. Both lists are plain per-browser preferences (localStorage, not
// org data): which presets an admin reaches for isn't tenant-scoped content,
// so there's no API/schema for it.
// ---------------------------------------------------------------------------
const LIBRARY_CATEGORIES = ['Recomendados', ...BLOCK_CATEGORIES]
const librarySearch = ref('')
const libraryCategory = ref<string>('Recomendados')
const RECENT_PRESETS_KEY = 'sa-builder-recent-presets'
const FAVORITE_PRESETS_KEY = 'sa-builder-favorite-presets'
const recentPresetIds = ref<string[]>([])
const favoritePresetIds = ref<Set<string>>(new Set())

function presetById(id: string) {
  return BLOCK_PRESETS.find((p) => p.presetId === id)
}
const recentPresets = computed(() => recentPresetIds.value.map(presetById).filter((p): p is BlockPreset => !!p))
const favoritePresets = computed(() => BLOCK_PRESETS.filter((p) => favoritePresetIds.value.has(p.presetId)))

const filteredPresets = computed(() => {
  const q = librarySearch.value.trim().toLowerCase()
  if (q) return BLOCK_PRESETS.filter((p) => p.label.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
  if (libraryCategory.value === 'Recomendados') return BLOCK_PRESETS.filter((p) => RECOMMENDED_PRESET_IDS.includes(p.presetId))
  return BLOCK_PRESETS.filter((p) => p.category === libraryCategory.value)
})

function rememberRecentPreset(presetId: string) {
  const next = [presetId, ...recentPresetIds.value.filter((id) => id !== presetId)].slice(0, 6)
  recentPresetIds.value = next
  if (import.meta.client) localStorage.setItem(RECENT_PRESETS_KEY, JSON.stringify(next))
}
function toggleFavorite(presetId: string) {
  const next = new Set(favoritePresetIds.value)
  if (next.has(presetId)) next.delete(presetId)
  else next.add(presetId)
  favoritePresetIds.value = next
  if (import.meta.client) localStorage.setItem(FAVORITE_PRESETS_KEY, JSON.stringify([...next]))
}

// ---------------------------------------------------------------------------
// Block Inspector — one component per block type (useSiteBuilderRegistry.ts),
// never a shared field list with conditionals. "Avanzado" (CommonBlockSettings)
// is appended once by this shell, so every block type gets it for free.
// ---------------------------------------------------------------------------
function inspectorFor(type: string) {
  return BLOCK_INSPECTORS[type] || null
}
const breadcrumb = computed(() => (selectedBlock.value ? blockLabel(selectedBlock.value.type) : ''))

// Live catalogue data for the "Datos" sections (Propiedades/Comunidades
// dynamic filters + manual selection) — fetched once here in the shell,
// independently of the canvas iframe's own copy for rendering. Never
// snapshotted into block content, exactly like the canvas's live data.
const previewData = ref<{ projects: any[]; communities: any[]; blogs: any[] } | null>(null)
const previewDataLoaded = ref(false)
function ensurePreviewData() {
  if (previewDataLoaded.value) return
  previewDataLoaded.value = true
  $fetch<{ projects: any[]; communities: any[]; blogs: any[] }>('/api/admin/site-pages/preview-data')
    .then((data) => (previewData.value = data))
    .catch(() => (previewData.value = { projects: [], communities: [], blogs: [] }))
}
watch(selectedBlock, (b) => {
  if (b && inspectorFor(b.type)?.needsPreviewData) ensurePreviewData()
})

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
// Set right before opening the library from an explicit "+ Añadir sección
// aquí" affordance (structure list or canvas gap) — addBlock() prefers this
// over "after the current selection" so the block lands exactly where the
// user pointed, not wherever the selection happened to be.
const insertAtIndex = ref<number | null>(null)

function addBlock(preset: BlockPreset) {
  pushUndo()
  const block: SiteBlock = { id: newBlockId(preset.type), type: preset.type, version: 1, content: preset.createContent() }
  const insertAt =
    insertAtIndex.value !== null
      ? insertAtIndex.value
      : selectedBlockId.value
        ? blocks.value.findIndex((b) => b.id === selectedBlockId.value) + 1
        : blocks.value.length
  blocks.value.splice(insertAt, 0, block)
  selectedBlockId.value = block.id
  rememberRecentPreset(preset.presetId)
  closeLibrary()
  nextTick(() => {
    structureListEl.value?.querySelector(`[data-block-row="${block.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    iframeEl.value?.contentWindow?.postMessage({ source: 'sa-builder-shell', type: 'scroll-to', id: block.id }, window.location.origin)
  })
}
function openLibraryAt(index: number | null) {
  insertAtIndex.value = index
  libraryOpen.value = true
}
function closeLibrary() {
  libraryOpen.value = false
  insertAtIndex.value = null
}
function moveBlock(id: string, dir: -1 | 1) {
  const i = blocks.value.findIndex((b) => b.id === id)
  const j = i + dir
  if (i === -1 || j < 0 || j >= blocks.value.length) return
  pushUndo()
  const [moved] = blocks.value.splice(i, 1)
  blocks.value.splice(j, 0, moved)
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
  try {
    recentPresetIds.value = JSON.parse(localStorage.getItem(RECENT_PRESETS_KEY) || '[]')
    favoritePresetIds.value = new Set(JSON.parse(localStorage.getItem(FAVORITE_PRESETS_KEY) || '[]'))
  } catch {
    // Corrupted/foreign localStorage value — start clean rather than break the builder over a UI preference.
  }

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
// Canvas fit-to-scale + zoom — keeps the real logical width/height of the
// selected breakpoint (Tailwind media queries inside the iframe still
// evaluate against DEVICE_WIDTH, unchanged) and only visually scales the
// device frame down with CSS transform so the full page fits the available
// area without horizontal scrolling. Never touches the published site.
// ---------------------------------------------------------------------------
const canvasMainEl = ref<HTMLElement | null>(null)
const canvasAvailable = reactive({ width: 0, height: 0 })
const CANVAS_PADDING = 64 // matches the <main> element's py-8/px implicit breathing room

const ZOOM_STEPS = [50, 60, 75, 90, 100, 125]
const zoomMode = ref<'auto' | number>('auto')
const zoomIndex = computed(() => {
  if (zoomMode.value === 'auto') return -1
  const i = ZOOM_STEPS.indexOf(zoomMode.value)
  return i === -1 ? 3 : i
})

const autoScale = computed(() => {
  const w = canvasAvailable.width - CANVAS_PADDING
  const deviceWidth = DEVICE_WIDTH[device.value]
  if (w <= 0 || !deviceWidth) return 1
  return Math.min(1, Math.max(0.25, w / deviceWidth))
})
const effectiveZoomPercent = computed(() => (zoomMode.value === 'auto' ? Math.round(autoScale.value * 100) : zoomMode.value))
const scale = computed(() => effectiveZoomPercent.value / 100)

const outerWidthPx = computed(() => Math.round(DEVICE_WIDTH[device.value] * scale.value))
// The unscaled frame is tall enough that, once scaled down, it visually fills
// the available canvas height — same full-height feel as before, plus more
// logical vertical room for the iframe's own internal scroll when zoomed out.
const frameHeightPx = computed(() => {
  const h = canvasAvailable.height - CANVAS_PADDING
  return h > 0 ? Math.round(h / scale.value) : 0
})
const outerHeightPx = computed(() => Math.round(frameHeightPx.value * scale.value))

function stepZoom(dir: 1 | -1) {
  const from = zoomMode.value === 'auto' ? ZOOM_STEPS.findIndex((s) => s >= effectiveZoomPercent.value) : zoomIndex.value
  const next = Math.min(ZOOM_STEPS.length - 1, Math.max(0, (from === -1 ? 0 : from) + dir))
  zoomMode.value = ZOOM_STEPS[next]
}

let resizeObserver: ResizeObserver | null = null
onMounted(() => {
  if (!canvasMainEl.value) return
  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (!entry) return
    canvasAvailable.width = entry.contentRect.width
    canvasAvailable.height = entry.contentRect.height
  })
  resizeObserver.observe(canvasMainEl.value)
})
onUnmounted(() => resizeObserver?.disconnect())

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
  switch (msg.type) {
    case 'ready':
      canvasReady = true
      sendState()
      break
    case 'select':
      selectedBlockId.value = msg.id
      break
    case 'hover':
      break
    case 'insert-at':
      openLibraryAt(msg.index)
      break
    case 'move-up':
      moveBlock(msg.id, -1)
      break
    case 'move-down':
      moveBlock(msg.id, 1)
      break
    case 'add-below': {
      const i = blocks.value.findIndex((b) => b.id === msg.id)
      openLibraryAt(i === -1 ? blocks.value.length : i + 1)
      break
    }
    case 'duplicate':
      duplicateBlock(msg.id)
      break
    case 'toggle-hide': {
      const block = blocks.value.find((b) => b.id === msg.id)
      if (block) toggleHide(block)
      break
    }
    case 'delete':
      deleteBlock(msg.id)
      break
  }
}
onMounted(() => window.addEventListener('message', handleMessage))
onUnmounted(() => window.removeEventListener('message', handleMessage))
</script>

<style scoped>
.structure-icon-btn {
  @apply flex h-6 w-6 shrink-0 items-center justify-center rounded text-stone-400 transition hover:bg-white hover:text-ink;
}
</style>
