<template>
  <div data-site-page :class="mode === 'builder' ? 'sb-editing' : ''">
    <!-- La hoja de estilos de los nodos y las fuentes que usa la página van
         en el propio árbol (no en useHead): así se actualizan con la misma
         reactividad que el resto del lienzo, y en el SSR salen tal cual. -->
    <component :is="'style'" v-if="pageCss" :key="cspNonce || 'no-nonce'" :nonce="cspNonce" data-site-page-css :innerHTML="pageCss" />
    <component :is="'link'" v-if="fontsHref" rel="stylesheet" :href="fontsHref" />
    <template v-for="(block, index) in visibleBlocks" :key="block.id">
      <!-- Insert-between affordance — builder-only, zero layout impact when
           not hovered (see .site-gap below), mirrors the "+ Añadir sección
           aquí" insertion point in the Estructura panel so either surface
           can start the same "position → pick a block → it lands there" flow. -->
      <div v-if="mode === 'builder'" class="group/gap relative z-50 h-3 -my-1.5">
        <div class="pointer-events-none absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 justify-center opacity-0 transition-opacity group-hover/gap:pointer-events-auto group-hover/gap:opacity-100">
          <button
            type="button"
            class="flex items-center gap-1 rounded-full border border-line bg-white px-3 py-1 text-[11px] font-semibold text-ink shadow-md transition hover:border-ink"
            @click.stop="emit('insert-at', index)"
          >
            <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" d="M12 5v14M5 12h14" /></svg>
            Añadir sección aquí
          </button>
        </div>
      </div>

      <SiteBlockFrame
        :block="block"
        :index="index"
        :count="visibleBlocks.length"
        :mode="mode"
        :device="device"
        :selected="mode === 'builder' && selection.blockId === block.id"
        @hover="(id) => emit('hover', id)"
        @move-up="(id) => emit('move-up', id)"
        @move-down="(id) => emit('move-down', id)"
        @add-below="(id) => emit('add-below', id)"
        @duplicate="(id) => emit('duplicate', id)"
        @toggle-hide="(id) => emit('toggle-hide', id)"
        @delete="(id) => emit('delete', id)"
      >
        <HeroBlock v-if="block.type === 'hero'" :content="block.content" />
        <MapTeaserBlock v-else-if="block.type === 'map-teaser'" :content="block.content" :projects="homeData?.projects || []" :mode="mode" />
        <PropertiesBlock v-else-if="block.type === 'properties'" :content="block.content" :projects="homeData?.projects || []" />
        <CommunitiesBlock v-else-if="block.type === 'communities'" :content="block.content" :communities="homeData?.communities || []" />
        <PropertyTypesBlock v-else-if="block.type === 'property-types'" :content="block.content" :projects="homeData?.projects || []" />
        <MortgageBlock v-else-if="block.type === 'mortgage-calculator'" :content="block.content" :projects="homeData?.projects || []" />
        <BlogListBlock v-else-if="block.type === 'blog-list'" :content="block.content" :blogs="homeData?.blogs || []" />
        <TeamBlock v-else-if="block.type === 'team'" :content="block.content" :team="homeData?.team || []" />
        <!-- Los dos únicos bloques con efecto real (crean un lead, reservan
             una cita) reciben `mode`: lo usan para no disparar nada desde el
             lienzo ni desde Vista previa. -->
        <LeadFormBlock v-else-if="block.type === 'lead-form'" :content="block.content" :mode="mode" />
        <BookVisitBlock v-else-if="block.type === 'book-visit'" :content="block.content" :team="homeData?.team || []" :mode="mode" />
        <TextBlock v-else-if="block.type === 'text'" :content="block.content" />
        <CtaBlock v-else-if="block.type === 'cta'" :content="block.content" />
        <div v-else-if="mode !== 'production'" class="mx-auto max-w-screen-2xl px-6 py-10 text-sm text-red-500">
          Tipo de bloque desconocido: {{ block.type }}
        </div>
      </SiteBlockFrame>
    </template>

    <div v-if="mode === 'builder'" class="group/gap relative z-50 h-3 -my-1.5">
      <div class="pointer-events-none absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 justify-center opacity-0 transition-opacity group-hover/gap:pointer-events-auto group-hover/gap:opacity-100">
        <button
          type="button"
          class="flex items-center gap-1 rounded-full border border-line bg-white px-3 py-1 text-[11px] font-semibold text-ink shadow-md transition hover:border-ink"
          @click.stop="emit('insert-at', visibleBlocks.length)"
        >
          <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" d="M12 5v14M5 12h14" /></svg>
          Añadir sección aquí
        </button>
      </div>
    </div>

    <NodeToolbar
      v-if="mode === 'builder'"
      :node="selectedNodeRef"
      :editing="!!editingNodeField"
      @edit="startEditSelected"
      @change-image="selectedNodeRef && nodeAction(selectedNodeRef, 'change-image')"
      @select-parent="selection.blockId && select(selection.blockId, null)"
    />
  </div>
</template>

<script setup lang="ts">
import type { SiteBlock, SitePageDocument } from '~/server/utils/sitePages'
import { buildPageCss, pageFontsHref } from '~/utils/siteBuilder/pageCss'
import { SITE_EDITOR_KEY, nodeRefFromElement, type SiteEditorContext, type SiteNodeRef } from '~/composables/useSiteEditor'
import SiteBlockFrame from './SiteBlockFrame.vue'
import NodeToolbar from './canvas/NodeToolbar.vue'
import HeroBlock from './blocks/HeroBlock.vue'
import MapTeaserBlock from './blocks/MapTeaserBlock.vue'
import PropertiesBlock from './blocks/PropertiesBlock.vue'
import CommunitiesBlock from './blocks/CommunitiesBlock.vue'
import PropertyTypesBlock from './blocks/PropertyTypesBlock.vue'
import MortgageBlock from './blocks/MortgageBlock.vue'
import BlogListBlock from './blocks/BlogListBlock.vue'
import TeamBlock from './blocks/TeamBlock.vue'
import LeadFormBlock from './blocks/LeadFormBlock.vue'
import BookVisitBlock from './blocks/BookVisitBlock.vue'
import TextBlock from './blocks/TextBlock.vue'
import CtaBlock from './blocks/CtaBlock.vue'

/**
 * The one component that turns a page's block array into markup — used
 * identically by the public site (pages/index.vue's portal branch, mode="production")
 * and by the builder's canvas (mode="builder"). Never fork this: a block
 * type that renders differently in the builder than in production is
 * exactly the bug this component exists to prevent.
 *
 * Lo que la página necesita en <head> para verse como se editó —la hoja de
 * estilos de los nodos y de los estilos globales, y las fuentes que usa—
 * sale de aquí en los tres modos (utils/siteBuilder/pageCss.ts): en el
 * lienzo se recalcula en vivo con cada cambio; en producción se sirve en el
 * SSR desde lo publicado. El DOM nunca es la fuente de verdad.
 *
 * mode="builder" adds selection/hover plumbing only — no visual chrome of
 * its own, so nothing here can leak into the published site. Provee a los
 * nodos el contexto de edición (composables/useSiteEditor.ts): quién está
 * seleccionado lo decide el shell y llega por props; qué texto se está
 * editando inline es local, porque el cursor no puede esperar al
 * postMessage.
 */
const props = withDefaults(
  defineProps<{
    blocks: SiteBlock[]
    homeData?: { projects?: any[]; communities?: any[]; blogs?: any[]; team?: any[] } | null
    mode?: 'production' | 'builder' | 'preview'
    /** builder-only: which breakpoint the canvas is currently simulating */
    device?: 'desktop' | 'tablet' | 'mobile'
    selectedBlockId?: string | null
    /** builder-only: campo del nodo seleccionado dentro de selectedBlockId */
    selectedNodeField?: string | null
    /** Estilos globales de la página (fuentes, radio de botones). */
    styles?: SitePageDocument['styles'] | null
  }>(),
  { mode: 'production', device: 'desktop', homeData: null, selectedBlockId: null, selectedNodeField: null, styles: null },
)

const emit = defineEmits<{
  select: [id: string | null, node: SiteNodeRef | null]
  hover: [id: string | null]
  'insert-at': [index: number]
  'move-up': [id: string]
  'move-down': [id: string]
  'add-below': [id: string]
  duplicate: [id: string]
  'toggle-hide': [id: string]
  delete: [id: string]
  'edit-start': [node: SiteNodeRef]
  'edit-node': [node: SiteNodeRef, text: string]
  'node-action': [node: SiteNodeRef, action: string]
}>()

const visibleBlocks = computed(() =>
  (props.blocks || []).filter((b) => {
    if (props.mode === 'production' || props.mode === 'preview') {
      const v = b.visibility
      if (!v) return true
      if (props.device === 'mobile' && v.mobile === false) return false
      if (props.device === 'tablet' && v.tablet === false) return false
      if (props.device === 'desktop' && v.desktop === false) return false
    }
    return true
  }),
)

// ---------------------------------------------------------------------------
// Hoja de estilos de la página + fuentes, en los tres modos
// ---------------------------------------------------------------------------
// `innerHTML` a propósito (y no interpolación): dentro de <style> el texto
// no se decodifica, así que las comillas de los selectores tienen que salir
// crudas — es CSS generado por utils/siteBuilder a partir de valores ya
// saneados (números, hex, fuentes del catálogo), nunca texto del usuario.
const pageCss = computed(() => buildPageCss({ blocks: props.blocks, styles: props.styles }))
const fontsHref = computed(() => pageFontsHref({ blocks: props.blocks, styles: props.styles }))

// CSP: style-src-elem lleva un nonce por petición (server/middleware/
// security-headers.ts) y, con un nonce presente, el navegador ignora
// 'unsafe-inline' — un <style> insertado desde JS sin nonce se descarta en
// silencio. En el SSR lo estampa server/plugins/csp-nonce.ts; en el cliente
// (el lienzo, que pinta la hoja al recibir cada estado) se lee del script de
// Nuxt, que ya lo lleva. El `key` recrea el elemento cuando el nonce se
// conoce, porque un <style> ya rechazado no se reevalúa al cambiarle el nonce.
const cspNonce = ref<string | undefined>(undefined)
onMounted(() => {
  const nonced = document.querySelector('script[nonce], style[nonce]') as (HTMLElement & { nonce?: string }) | null
  cspNonce.value = nonced?.nonce || undefined
})

// ---------------------------------------------------------------------------
// Contexto de edición (sólo hace algo en mode="builder")
// ---------------------------------------------------------------------------
// Selección optimista: se refleja al instante al hacer clic y se
// sobreescribe con lo que el shell confirme por props.
const selection = reactive<{ blockId: string | null; nodeField: string | null }>({ blockId: props.selectedBlockId, nodeField: props.selectedNodeField })
watch(
  () => [props.selectedBlockId, props.selectedNodeField] as const,
  ([blockId, nodeField]) => {
    selection.blockId = blockId
    selection.nodeField = nodeField
    if (editingNodeField.value && (editingBlockId !== blockId || editingNodeField.value !== nodeField)) stopEdit()
  },
)

const modeRef = computed(() => props.mode)
const selectedBlockIdRef = computed(() => selection.blockId)
const selectedNodeFieldRef = computed(() => selection.nodeField)
const editingNodeField = ref<string | null>(null)
let editingBlockId: string | null = null

function select(blockId: string | null, node: SiteNodeRef | null) {
  if (editingNodeField.value) stopEdit()
  selection.blockId = blockId
  selection.nodeField = node?.field ?? null
  emit('select', blockId, node)
}
function startEdit(node: SiteNodeRef) {
  selection.blockId = node.blockId
  selection.nodeField = node.field
  editingBlockId = node.blockId
  editingNodeField.value = node.field
  emit('edit-start', node)
}
function stopEdit() {
  editingNodeField.value = null
  editingBlockId = null
}
function updateText(node: SiteNodeRef, text: string) {
  emit('edit-node', node, text)
}
function nodeAction(node: SiteNodeRef, action: string) {
  emit('node-action', node, action)
}

const context: SiteEditorContext = {
  mode: modeRef,
  selectedBlockId: selectedBlockIdRef,
  selectedNodeField: selectedNodeFieldRef,
  editingNodeField,
  select,
  startEdit,
  stopEdit,
  updateText,
  nodeAction,
}
provide(SITE_EDITOR_KEY, context)

/** Descripción del nodo seleccionado, leída del DOM (el shell sólo conoce bloque + campo). */
const selectedNodeRef = ref<SiteNodeRef | null>(null)
watch(
  () => [selection.blockId, selection.nodeField, props.mode, props.blocks] as const,
  async () => {
    if (props.mode !== 'builder' || !selection.blockId || !selection.nodeField) {
      selectedNodeRef.value = null
      return
    }
    await nextTick()
    const el = document.querySelector(`[data-sb-node="${selection.blockId}:${selection.nodeField}"]`)
    selectedNodeRef.value = el ? nodeRefFromElement(el) : null
  },
  { immediate: true, flush: 'post' },
)

function startEditSelected() {
  const node = selectedNodeRef.value
  if (node && !node.dynamic) startEdit(node)
}

defineExpose({ startEditSelected, stopEdit, selectedNodeRef })
</script>

<style>
/* Sólo bajo .sb-editing (el lienzo del Constructor): en producción esa
   clase no existe y ninguna de estas reglas se aplica. Los contornos son
   `outline`, que no ocupa sitio: el layout que se ve editando es el real. */
.sb-editing [data-sb-node] {
  cursor: default;
}
.sb-editing [data-sb-node]:hover {
  outline: 1px dashed rgba(59, 130, 246, 0.75);
  outline-offset: 2px;
}
.sb-editing [data-sb-node][data-sb-selected] {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
}
.sb-editing [data-sb-node][data-sb-editing],
.sb-editing [data-sb-node][data-sb-editing] [contenteditable] {
  outline: 2px solid #f59e0b;
  outline-offset: 2px;
  cursor: text;
}
.sb-editing [contenteditable]:focus {
  outline: none;
}
</style>
