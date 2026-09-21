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
      @open-styles="stylesOpen = true"
      @open-history="historyOpen = true"
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
              @click="selectFromStructure(block.id)"
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
            <input v-model="librarySearch" type="text" placeholder="Buscar secciones..." class="input !py-2 !pl-9 !text-sm" >
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

      <!-- Right panel collapsed: a thin strip, always available to reopen
           (mirrors the Estructura panel's own collapse) — never an empty
           column, and the selection underneath is untouched. -->
      <aside v-else-if="!previewMode && inspectorCollapsed" class="flex w-11 shrink-0 flex-col items-center border-l border-line bg-white pt-3">
        <button type="button" class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-stone-400 transition hover:bg-stone-100 hover:text-ink" title="Expandir inspector" aria-expanded="false" @click="toggleInspectorCollapsed">
          <svg class="h-3.5 w-3.5 rotate-180 transition-transform duration-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </aside>

      <!-- Right panel: cabecera/pie seleccionados (elementos globales) -->
      <aside v-else-if="!previewMode && selectedGlobal" class="flex w-96 shrink-0 flex-col overflow-hidden border-l border-line bg-white">
        <div class="shrink-0 border-b border-line p-4">
          <div class="flex items-center justify-between">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-stone-500" data-testid="inspector-title">Elemento global</p>
            <button type="button" aria-label="Cerrar inspector" class="text-stone-300 hover:text-ink" @click="selectedGlobal = null">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto p-4">
          <GlobalZoneInspector :zone="selectedGlobal.zone" :element="selectedGlobal.element" />
        </div>
      </aside>

      <!-- Right panel: Inspector (del nodo seleccionado, o del bloque) -->
      <aside v-else-if="!previewMode && selectedBlock" class="flex w-96 shrink-0 flex-col overflow-hidden border-l border-line bg-white" @focusin="onPanelFocusIn" @focusout="onPanelFocusOut">
        <div class="shrink-0 border-b border-line p-4">
          <div class="mb-3 flex items-center justify-between">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-stone-500" data-testid="inspector-title">{{ inspectorTitle }}</p>
            <div class="flex shrink-0 items-center gap-1">
              <button type="button" class="flex h-6 w-6 items-center justify-center rounded text-stone-400 transition hover:bg-stone-100 hover:text-ink" title="Contraer inspector" aria-expanded="true" @click="toggleInspectorCollapsed">
                <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 18l6-6-6-6" /></svg>
              </button>
              <button type="button" aria-label="Cerrar inspector" class="text-stone-300 hover:text-ink" @click="clearSelection">
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
          <!-- Miga de pan: Sección › Elemento. Pulsar la sección sube de nivel. -->
          <div class="mb-3 flex items-center gap-2 rounded-lg bg-paper px-3 py-2" data-testid="inspector-breadcrumb">
            <div class="min-w-0">
              <p class="truncate text-[13px] font-semibold text-ink">
                <button v-if="selectedNode" type="button" class="text-stone-500 hover:text-ink hover:underline" data-testid="breadcrumb-block" @click="selectedNode = null">{{ pad2(selectedBlockIndex + 1) }} · {{ breadcrumb }}</button>
                <template v-else>{{ pad2(selectedBlockIndex + 1) }} · {{ breadcrumb }}</template>
                <template v-if="selectedNode"><span class="mx-1 text-stone-300">›</span><span data-testid="breadcrumb-node">{{ selectedNode.label }}</span></template>
              </p>
              <p class="truncate text-[11px] text-stone-500">{{ selectedNode ? (selectedNode.dynamic ? `Contenido dinámico · ${selectedNode.dynamic}` : nodeKindLabel(selectedNode.kind)) : blockSubtitle(selectedBlock) }}</p>
            </div>
          </div>
          <div class="flex gap-1 rounded-lg bg-stone-100 p-1">
            <button
              v-for="t in INSPECTOR_TABS"
              :key="t.key"
              type="button"
              class="flex-1 rounded-md px-2 py-1.5 text-[12px] font-semibold transition"
              :class="inspectorTab === t.key ? 'bg-white text-ink shadow' : 'text-stone-500 hover:text-ink'"
              @click="inspectorTab = t.key"
            >
              {{ t.label }}
            </button>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-4">
          <NodeInspector
            v-if="selectedNode"
            :key="`${selectedBlock.id}:${selectedNode.field}`"
            :block="selectedBlock"
            :node="selectedNode"
            :device="device"
            :global-styles="styles"
            :brand-colors="brandColors"
            :brand-fonts="brandFonts"
          />
          <template v-else>
            <component
              :is="inspectorFor(selectedBlock.type)?.component"
              v-if="inspectorFor(selectedBlock.type)"
              :content="selectedBlock.content"
              :projects="previewData?.projects || []"
              :communities="previewData?.communities || []"
              :team="previewData?.team || []"
            />
            <p v-else-if="inspectorTab === 'content'" class="text-sm text-stone-400">Este tipo de bloque no tiene opciones adicionales todavía.</p>
          </template>

          <InspectorSection :title="selectedNode ? 'Avanzado de la sección' : 'Avanzado'" tab="advanced">
            <CommonBlockSettings :block="selectedBlock" />
          </InspectorSection>
        </div>
      </aside>
      <aside v-else-if="!previewMode" class="relative flex w-96 shrink-0 items-center justify-center border-l border-line bg-white p-6 text-center text-sm text-stone-400">
        <button type="button" class="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded text-stone-400 transition hover:bg-stone-100 hover:text-ink" title="Contraer inspector" aria-expanded="true" @click="toggleInspectorCollapsed">
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 18l6-6-6-6" /></svg>
        </button>
        <span data-testid="inspector-empty">Pulsa cualquier texto, botón, imagen o sección del lienzo para editarlo. Doble clic sobre un texto para escribir directamente.</span>
      </aside>
    </div>

    <!-- Historial de versiones publicadas -->
    <VersionHistory v-if="historyOpen" page-key="home" @close="historyOpen = false" @restored="onRestored" />

    <!-- Estilos globales -->
    <GlobalStylesPanel v-if="stylesOpen" :styles="styles" :brand-fonts="brandFonts" @close="stylesOpen = false" />

    <!-- "Cambiar imagen" desde el lienzo -->
    <MediaPickerModal v-if="mediaPickerTarget" :label="mediaPickerTarget.label" @close="mediaPickerTarget = null" @select="onMediaPicked" />

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
          <input v-model="seo.title" class="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-ink focus:outline-none" maxlength="200" >
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
import type { SiteGlobalStyles } from '~/utils/siteBuilder/globalStyles'
import { nodeKindLabel, normalizeColor, type NodeKind } from '~/utils/siteBuilder/nodes'
import { isKnownFont } from '~/utils/siteBuilder/fonts'
import type { SiteNodeRef } from '~/composables/useSiteEditor'
import { BLOCK_PRESETS, BLOCK_CATEGORIES, BLOCK_INSPECTORS, RECOMMENDED_PRESET_IDS, blockLabel, blockSubtitle, newBlockId, type BlockPreset } from '~/composables/useSiteBuilderRegistry'
import InspectorSection from '~/components/site-builder/inspector/InspectorSection.vue'
import CommonBlockSettings from '~/components/site-builder/inspector/CommonBlockSettings.vue'
import NodeInspector from '~/components/site-builder/inspector/NodeInspector.vue'
import GlobalZoneInspector from '~/components/site-builder/inspector/GlobalZoneInspector.vue'
import TopBar from '~/components/site-builder/shell/TopBar.vue'
import SectionCard from '~/components/site-builder/shell/SectionCard.vue'
import VersionHistory from '~/components/site-builder/shell/VersionHistory.vue'
import GlobalStylesPanel from '~/components/site-builder/shell/GlobalStylesPanel.vue'
import MediaPickerModal from '~/components/site-builder/shell/MediaPickerModal.vue'

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
// Estilos globales de la página (utils/siteBuilder/globalStyles.ts) — se
// guardan y publican con el documento, igual que `seo`.
const styles = reactive<SiteGlobalStyles>({})
const device = ref<'desktop' | 'tablet' | 'mobile'>('desktop')
const previewMode = ref(false)
const libraryOpen = ref(false)
const seoOpen = ref(false)
const stylesOpen = ref(false)
const historyOpen = ref(false)
const dragOverId = ref<string | null>(null)
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}
// Real routes this site already has — only "Inicio" is backed by site_pages
// today (server/utils/sitePages.ts hard-rejects any other pageKey), so the
// rest are listed for orientation, not as a page CRUD that doesn't exist yet.
const OTHER_PAGES = ['Propiedades', 'Ficha de propiedad', 'Nosotros', 'Servicios', 'Contacto', 'Blog']

// ---------------------------------------------------------------------------
// Selección — un solo modelo para todo el editor (Selection Manager):
//   selectedBlockId  la sección seleccionada (lienzo, Estructura o miga de pan)
//   selectedNode     el elemento dentro de ella (título, botón, imagen…), o null
//   selectedGlobal   cabecera/pie, que no son de la página sino del sitio
// El lienzo (iframe) es el que sabe qué hay bajo el puntero y lo reporta por
// postMessage; aquí se decide, y se manda de vuelta con `sendState`, así que
// lienzo, Estructura e Inspector siempre enseñan la misma selección.
// ---------------------------------------------------------------------------
const selectedBlockId = ref<string | null>(null)
const selectedNode = ref<SiteNodeRef | null>(null)
const selectedGlobal = ref<{ zone: 'header' | 'footer'; element: string | null } | null>(null)

function selectBlock(id: string | null, node: SiteNodeRef | null = null) {
  selectedGlobal.value = null
  selectedBlockId.value = id
  selectedNode.value = id && node && node.blockId === id ? node : null
}
function selectFromStructure(id: string) {
  selectBlock(id)
  // Una sección elegida en la lista tiene que verse: scroll suave en el lienzo.
  iframeEl.value?.contentWindow?.postMessage({ source: 'sa-builder-shell', type: 'scroll-to', id }, window.location.origin)
}
function clearSelection() {
  selectBlock(null)
}

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

// Same collapse pattern as Estructura above, mirrored for the right panel —
// the library (libraryOpen) always ignores this and shows at full width,
// since collapsing "while actively picking a section to add" isn't a real
// user intent.
const INSPECTOR_COLLAPSED_KEY = 'sa-builder-inspector-collapsed'
const inspectorCollapsed = ref(false)
function toggleInspectorCollapsed() {
  inspectorCollapsed.value = !inspectorCollapsed.value
  if (import.meta.client) sessionStorage.setItem(INSPECTOR_COLLAPSED_KEY, inspectorCollapsed.value ? '1' : '0')
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
const selectedBlockIndex = computed(() => blocks.value.findIndex((b) => b.id === selectedBlockId.value))

// ---------------------------------------------------------------------------
// Inspector tabs — Contenido/Diseño/Avanzado, per-InspectorSection routing
// via provide/inject (see InspectorSection.vue). Resets to "Contenido"
// whenever the selection changes, so switching blocks never leaves an admin
// stranded on a tab the new block doesn't have anything under.
// ---------------------------------------------------------------------------
const INSPECTOR_TABS: { key: 'content' | 'design' | 'advanced'; label: string }[] = [
  { key: 'content', label: 'Contenido' },
  { key: 'design', label: 'Diseño' },
  { key: 'advanced', label: 'Avanzado' },
]
const inspectorTab = ref<'content' | 'design' | 'advanced'>('content')
provide('inspectorTab', inspectorTab)
watch(selectedBlockId, () => {
  inspectorTab.value = 'content'
})
watch(selectedNode, (node, prev) => {
  if (node?.field !== prev?.field) inspectorTab.value = 'content'
  if (node) ensureBrandKit()
})

const INSPECTOR_TITLES: Record<NodeKind, string> = {
  heading: 'Propiedades del texto',
  text: 'Propiedades del texto',
  eyebrow: 'Propiedades de la etiqueta',
  caption: 'Propiedades del texto',
  button: 'Propiedades del botón',
  link: 'Propiedades del enlace',
  image: 'Propiedades de la imagen',
  card: 'Propiedades de la tarjeta',
  box: 'Propiedades del contenedor',
}
const inspectorTitle = computed(() => (selectedNode.value ? INSPECTOR_TITLES[selectedNode.value.kind] : 'Propiedades de la sección'))

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
const previewData = ref<{ projects: any[]; communities: any[]; blogs: any[]; team: any[] } | null>(null)
const previewDataLoaded = ref(false)
function ensurePreviewData() {
  if (previewDataLoaded.value) return
  previewDataLoaded.value = true
  $fetch<{ projects: any[]; communities: any[]; blogs: any[]; team: any[] }>('/api/admin/site-pages/preview-data')
    .then((data) => (previewData.value = data))
    .catch(() => (previewData.value = { projects: [], communities: [], blogs: [], team: [] }))
}
watch(selectedBlock, (b) => {
  if (b && inspectorFor(b.type)?.needsPreviewData) ensurePreviewData()
})

// Brand Kit (colores y fuentes de marca) para los accesos rápidos del
// inspector de nodos — se pide una vez, la primera vez que se selecciona un
// elemento; sin Brand Kit los campos funcionan igual, sólo sin esa fila.
const brandKit = ref<any | null>(null)
let brandKitRequested = false
function ensureBrandKit() {
  if (brandKitRequested) return
  brandKitRequested = true
  $fetch<any>('/api/admin/asset-export/brand-kit')
    .then((kit) => (brandKit.value = kit))
    .catch(() => (brandKit.value = null))
}
const brandColors = computed(() => {
  const kit = brandKit.value
  if (!kit) return []
  let accents: string[] = []
  try {
    accents = JSON.parse(kit.colorAccentsJson || '[]')
  } catch {
    accents = []
  }
  const raw = [
    { label: 'Principal', value: kit.colorPrimary },
    { label: 'Secundario', value: kit.colorSecondary },
    ...accents.map((c, i) => ({ label: `Acento ${i + 1}`, value: c })),
    { label: 'Fondo', value: kit.colorBackground },
    { label: 'Texto', value: kit.colorText },
  ]
  return raw.filter((c) => normalizeColor(c.value)).map((c) => ({ label: c.label, value: normalizeColor(c.value)! }))
})
const brandFonts = computed(() => {
  const kit = brandKit.value
  if (!kit) return []
  return [kit.fontHeading, kit.fontBody, kit.fontAlt].filter(isKnownFont)
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
// structural change (add/delete/duplicate/reorder/visibility), once per
// "edit burst" from the inspector or the canvas (beginEditBurst: a run of
// changes with less than 1.2 s between them is one undo step — never per
// keystroke), and once when an inline edit starts. Covers text, colour,
// font, image, spacing and global styles alike, not just drag & drop.
// ---------------------------------------------------------------------------
const undoStack: string[] = []
const redoStack: string[] = []
const canUndo = ref(false)
const canRedo = ref(false)
const MAX_HISTORY = 50

function snapshot() {
  return JSON.stringify({ blocks: blocks.value, styles })
}
/** Sustituye los estilos globales en sitio (el objeto reactivo es el que observan el autoguardado y el lienzo). */
function replaceStyles(next: SiteGlobalStyles | undefined) {
  for (const key of Object.keys(styles) as (keyof SiteGlobalStyles)[]) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete styles[key]
  }
  Object.assign(styles, next || {})
}
function restoreSnapshot(json: string) {
  const parsed = JSON.parse(json)
  blocks.value = parsed.blocks || []
  replaceStyles(parsed.styles)
  if (selectedBlockId.value && !blocks.value.some((b) => b.id === selectedBlockId.value)) selectBlock(null)
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
  restoreSnapshot(undoStack.pop()!)
  canUndo.value = undoStack.length > 0
  canRedo.value = true
}
function redo() {
  if (!redoStack.length) return
  undoStack.push(snapshot())
  restoreSnapshot(redoStack.pop()!)
  canRedo.value = redoStack.length > 0
  canUndo.value = true
}

let editBurstActive = false
let editBurstTimer: ReturnType<typeof setTimeout> | null = null
function beginEditBurst() {
  if (!editBurstActive) {
    pushUndo()
    editBurstActive = true
  }
  if (editBurstTimer) clearTimeout(editBurstTimer)
  editBurstTimer = setTimeout(() => (editBurstActive = false), 1200)
}
provide('sbBeginEdit', beginEditBurst)

function onPanelFocusIn() {
  beginEditBurst()
}
function onPanelFocusOut(e: FocusEvent) {
  const panel = (e.currentTarget as HTMLElement) || null
  setTimeout(() => {
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
  selectBlock(block.id)
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
  const idx = blocks.value.findIndex((b) => b.id === id)
  if (idx === -1) return
  pushUndo()
  const original = blocks.value[idx]
  // Copia completa: contenido, opciones comunes y estilos de sus elementos.
  const copy: SiteBlock = { ...JSON.parse(JSON.stringify(original)), id: newBlockId(original.type) }
  blocks.value.splice(idx + 1, 0, copy)
  selectBlock(copy.id)
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
  if (selectedBlockId.value === id) selectBlock(null)
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
// Edición desde el lienzo (mensajes del iframe)
// ---------------------------------------------------------------------------
function blockById(id: string): SiteBlock | undefined {
  return blocks.value.find((b) => b.id === id)
}
/** Una tecla pulsada dentro de un texto del lienzo: el modelo cambia al instante; el inspector lo ve por reactividad. */
function applyInlineText(id: string, field: string, text: string) {
  const block = blockById(id)
  if (!block) return
  block.content[field] = text
}

const mediaPickerTarget = ref<{ blockId: string; field: string; label: string } | null>(null)
function onMediaPicked(key: string) {
  const target = mediaPickerTarget.value
  mediaPickerTarget.value = null
  if (!target) return
  const block = blockById(target.blockId)
  if (!block) return
  beginEditBurst()
  block.content[target.field] = key
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
  styles?: SiteGlobalStyles
  version: number
  publishedAt: string | null
  hasUnpublishedChanges: boolean
}

onMounted(async () => {
  structureCollapsed.value = sessionStorage.getItem(STRUCTURE_COLLAPSED_KEY) === '1'
  inspectorCollapsed.value = sessionStorage.getItem(INSPECTOR_COLLAPSED_KEY) === '1'
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
  Object.assign(styles, data.styles || {})
  pageVersion.value = data.version || 0
  hasUnpublishedChanges.value = data.hasUnpublishedChanges
  loaded = true
})

watch(
  [blocks, seo, styles],
  () => {
    if (!loaded) return
    hasUnpublishedChanges.value = true
    scheduleSave()
  },
  { deep: true },
)

function draftBody() {
  return { blocks: blocks.value, seo, styles }
}

function scheduleSave() {
  saveState.value = 'saving'
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    saveTimer = null
    try {
      await $fetch<{ ok: true }>('/api/admin/site-pages/home', { method: 'PUT', body: draftBody() })
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
      saveTimer = null
      await $fetch('/api/admin/site-pages/home', { method: 'PUT', body: draftBody() })
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

// Un borrador sin guardar no se pierde por cerrar la pestaña: el navegador
// pregunta. (Recargar el editor recupera siempre el último autoguardado.)
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (saveTimer || saveState.value === 'saving' || saveState.value === 'error') {
    e.preventDefault()
    e.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onUnmounted(() => window.removeEventListener('beforeunload', onBeforeUnload))

/**
 * A restored version lands on the draft, exactly like any other edit — so it
 * goes through the same undo stack (pushUndo first, so Ctrl+Z gets the
 * pre-restore draft back) and the same autosave watcher, which is also what
 * correctly flips the "cambios sin publicar" indicator: the draft now differs
 * from what's live, and it stays that way until Publicar.
 */
function onRestored(payload: { version: number; blocks: SiteBlock[]; seo: { title?: string; description?: string }; styles?: SiteGlobalStyles }) {
  pushUndo()
  blocks.value = payload.blocks
  seo.title = payload.seo?.title || ''
  seo.description = payload.seo?.description || ''
  replaceStyles(payload.styles)
  if (!blocks.value.some((b) => b.id === selectedBlockId.value)) selectBlock(null)
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
      styles: JSON.parse(JSON.stringify(styles)),
      device: device.value,
      selectedBlockId: previewMode.value ? null : selectedBlockId.value,
      selectedNodeField: previewMode.value ? null : (selectedNode.value?.field ?? null),
      selectedGlobal: previewMode.value ? null : (selectedGlobal.value?.zone ?? null),
      mode: previewMode.value ? 'preview' : 'builder',
    },
    window.location.origin,
  )
}
watch([blocks, styles, device, selectedBlockId, selectedNode, selectedGlobal, previewMode], sendState, { deep: true })

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
      selectBlock(msg.id ?? null, msg.node ?? null)
      break
    case 'select-global':
      selectedBlockId.value = null
      selectedNode.value = null
      selectedGlobal.value = { zone: msg.zone === 'footer' ? 'footer' : 'header', element: msg.element ?? null }
      break
    case 'hover':
      break
    case 'edit-start':
      pushUndo()
      break
    case 'edit-node':
      applyInlineText(msg.id, msg.field, String(msg.text ?? ''))
      break
    case 'node-action':
      if (msg.action === 'change-image' && msg.node) {
        selectBlock(msg.id, msg.node)
        mediaPickerTarget.value = { blockId: msg.id, field: msg.field, label: msg.node.label || 'Imagen' }
      }
      break
    case 'command':
      if (msg.name === 'undo') undo()
      else if (msg.name === 'redo') redo()
      else if (msg.name === 'delete' && selectedBlockId.value && !selectedNode.value) deleteBlock(selectedBlockId.value)
      else if (msg.name === 'duplicate' && selectedBlockId.value) duplicateBlock(selectedBlockId.value)
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
      const block = blockById(msg.id)
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

// Atajos con el foco en el shell (con el foco en el lienzo los maneja
// canvas.vue y llegan como `command`): Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z (y
// Ctrl+Y) para deshacer/rehacer, Ctrl/Cmd+D duplica, Supr elimina la
// sección seleccionada (con confirmación), Esc sube de nivel. Ignorados
// mientras se escribe en un campo, para no pelear con el undo nativo.
function isEditableTarget(el: EventTarget | null): boolean {
  const tag = (el as HTMLElement)?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement)?.isContentEditable === true
}
function onKeydown(e: KeyboardEvent) {
  if (isEditableTarget(e.target)) return
  const meta = e.ctrlKey || e.metaKey
  const key = e.key.toLowerCase()
  if (meta && key === 'z' && !e.shiftKey) {
    e.preventDefault()
    undo()
  } else if ((meta && key === 'z' && e.shiftKey) || (meta && key === 'y')) {
    e.preventDefault()
    redo()
  } else if (meta && key === 'd' && selectedBlockId.value && !previewMode.value) {
    e.preventDefault()
    duplicateBlock(selectedBlockId.value)
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBlockId.value && !selectedNode.value && !previewMode.value) {
    e.preventDefault()
    deleteBlock(selectedBlockId.value)
  } else if (e.key === 'Escape' && !previewMode.value) {
    if (libraryOpen.value) closeLibrary()
    else if (selectedNode.value) selectedNode.value = null
    else if (selectedBlockId.value || selectedGlobal.value) clearSelection()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<style scoped>
.structure-icon-btn {
  @apply flex h-6 w-6 shrink-0 items-center justify-center rounded text-stone-400 transition hover:bg-white hover:text-ink;
}
</style>
