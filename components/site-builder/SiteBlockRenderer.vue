<template>
  <div>
    <template v-for="(block, index) in visibleBlocks" :key="block.id">
      <!-- Insert-between affordance — builder-only, zero layout impact when
           not hovered (see .site-gap below), mirrors the "+ Añadir sección
           aquí" insertion point in the Estructura panel so either surface
           can start the same "position → pick a block → it lands there" flow. -->
      <div v-if="mode === 'builder'" class="group/gap relative z-20 h-3 -my-1.5">
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

      <div v-bind="wrapperAttrs(block)">
        <span
          v-if="mode === 'builder'"
          class="pointer-events-none absolute left-2 top-2 z-10 rounded bg-blue-500 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow transition-opacity"
          :class="selectedBlockId === block.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
        >
          {{ index + 1 }}. {{ blockLabel(block.type) }}
        </span>

        <div
          v-if="mode === 'builder' && selectedBlockId === block.id"
          data-block-toolbar
          class="absolute right-2 top-2 z-20 flex items-center gap-0.5 rounded-lg border border-line bg-white p-1 shadow-lg"
        >
          <button type="button" class="canvas-toolbar-btn" title="Subir" :disabled="index === 0" @click="emit('move-up', block.id)">
            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 19V5M5 12l7-7 7 7" /></svg>
          </button>
          <button type="button" class="canvas-toolbar-btn" title="Bajar" :disabled="index === visibleBlocks.length - 1" @click="emit('move-down', block.id)">
            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14M5 12l7 7 7-7" /></svg>
          </button>
          <span class="mx-0.5 h-4 w-px bg-line" />
          <button type="button" class="canvas-toolbar-btn" title="Añadir debajo" @click="emit('add-below', block.id)">
            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 5v14M5 12h14" /></svg>
          </button>
          <button type="button" class="canvas-toolbar-btn" title="Duplicar" @click="emit('duplicate', block.id)">
            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
          </button>
          <button type="button" class="canvas-toolbar-btn" :title="isHiddenOnDevice(block) ? 'Mostrar' : 'Ocultar en este dispositivo'" @click="emit('toggle-hide', block.id)">
            <svg v-if="isHiddenOnDevice(block)" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a20.4 20.4 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" /></svg>
            <svg v-else class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
          </button>
          <span class="mx-0.5 h-4 w-px bg-line" />
          <button type="button" class="canvas-toolbar-btn hover:!bg-red-50 hover:!text-red-600" title="Eliminar" @click="emit('delete', block.id)">
            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16z" /></svg>
          </button>
        </div>

        <HeroBlock v-if="block.type === 'hero'" :content="block.content" />
        <MapTeaserBlock v-else-if="block.type === 'map-teaser'" :content="block.content" />
        <PropertiesBlock v-else-if="block.type === 'properties'" :content="block.content" :projects="homeData?.projects || []" />
        <CommunitiesBlock v-else-if="block.type === 'communities'" :content="block.content" :communities="homeData?.communities || []" />
        <PropertyTypesBlock v-else-if="block.type === 'property-types'" :content="block.content" :projects="homeData?.projects || []" />
        <MortgageBlock v-else-if="block.type === 'mortgage-calculator'" :content="block.content" :projects="homeData?.projects || []" />
        <BlogListBlock v-else-if="block.type === 'blog-list'" :content="block.content" :blogs="homeData?.blogs || []" />
        <TextBlock v-else-if="block.type === 'text'" :content="block.content" />
        <CtaBlock v-else-if="block.type === 'cta'" :content="block.content" />
        <div v-else-if="mode !== 'production'" class="mx-auto max-w-screen-2xl px-6 py-10 text-sm text-red-500">
          Tipo de bloque desconocido: {{ block.type }}
        </div>
      </div>
    </template>

    <div v-if="mode === 'builder'" class="group/gap relative z-20 h-3 -my-1.5">
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
  </div>
</template>

<script setup lang="ts">
import type { SiteBlock } from '~/server/utils/sitePages'
import { blockLabel } from '~/composables/useSiteBuilderRegistry'
import HeroBlock from './blocks/HeroBlock.vue'
import MapTeaserBlock from './blocks/MapTeaserBlock.vue'
import PropertiesBlock from './blocks/PropertiesBlock.vue'
import CommunitiesBlock from './blocks/CommunitiesBlock.vue'
import PropertyTypesBlock from './blocks/PropertyTypesBlock.vue'
import MortgageBlock from './blocks/MortgageBlock.vue'
import BlogListBlock from './blocks/BlogListBlock.vue'
import TextBlock from './blocks/TextBlock.vue'
import CtaBlock from './blocks/CtaBlock.vue'

/**
 * The one component that turns a page's block array into markup — used
 * identically by the public site (pages/index.vue's portal branch, mode="production")
 * and by the builder's canvas (mode="builder"). Never fork this: a block
 * type that renders differently in the builder than in production is
 * exactly the bug this component exists to prevent.
 *
 * mode="builder" adds selection/hover plumbing only — no visual chrome of
 * its own, so nothing here can leak into the published site.
 */
const props = withDefaults(
  defineProps<{
    blocks: SiteBlock[]
    homeData?: { projects?: any[]; communities?: any[]; blogs?: any[] } | null
    mode?: 'production' | 'builder' | 'preview'
    /** builder-only: which breakpoint the canvas is currently simulating */
    device?: 'desktop' | 'tablet' | 'mobile'
    selectedBlockId?: string | null
  }>(),
  { mode: 'production', device: 'desktop', homeData: null, selectedBlockId: null },
)

const emit = defineEmits<{
  select: [id: string]
  hover: [id: string | null]
  'insert-at': [index: number]
  'move-up': [id: string]
  'move-down': [id: string]
  'add-below': [id: string]
  duplicate: [id: string]
  'toggle-hide': [id: string]
  delete: [id: string]
}>()

function isHiddenOnDevice(block: SiteBlock): boolean {
  return block.visibility?.[props.device] === false
}

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

const BACKGROUND_CLASS: Record<string, string> = { paper: 'bg-paper', white: 'bg-white', surface: 'bg-surface', ink: 'bg-ink' }
const SPACING_REM: Record<string, string> = { sm: '1.5rem', lg: '3rem' }

/**
 * Applies the "Avanzado" common options (CommonBlockSettings.vue) — anchor,
 * background, extra spacing — identically in every mode, since these are
 * real published styling, not builder chrome. Only the selection outline,
 * hover, and click-to-select wiring below are builder-only.
 */
function wrapperAttrs(block: SiteBlock) {
  const style = block.style || {}
  const common: Record<string, any> = {}
  if (style.anchorId) common.id = style.anchorId
  const classes = ['relative', style.background ? BACKGROUND_CLASS[style.background] : '']
  const inlineStyle: Record<string, string> = {}
  if (style.paddingTop && SPACING_REM[style.paddingTop]) inlineStyle.paddingTop = SPACING_REM[style.paddingTop]
  if (style.paddingBottom && SPACING_REM[style.paddingBottom]) inlineStyle.paddingBottom = SPACING_REM[style.paddingBottom]
  if (Object.keys(inlineStyle).length) common.style = inlineStyle

  if (props.mode !== 'builder') return { ...common, class: classes }

  const hiddenOnDevice = block.visibility && block.visibility[props.device] === false
  return {
    ...common,
    'data-site-block-id': block.id,
    'data-site-block-type': block.type,
    class: [
      ...classes,
      'group site-block-wrap outline-offset-[-2px] transition-[outline-color]',
      props.selectedBlockId === block.id ? 'outline outline-2 outline-blue-500' : 'outline outline-2 outline-transparent hover:outline-blue-300',
      hiddenOnDevice ? 'opacity-40' : '',
    ],
    // Capture phase, not bubble: a plain `onClick` here would fire *after*
    // a nested <a>/button's own handler (router.push, a real href
    // navigation…), since those live further down the tree and get first
    // dispatch. Intercepting on the way down and calling preventDefault
    // blocks the browser's default navigation before it's decided, and
    // stopPropagation keeps the event from ever reaching the nested
    // element's own listeners at all — so no per-component patching is
    // needed for links, buttons, cards or forms nested inside a block.
    // The one deliberate exception is the floating block toolbar itself
    // ([data-block-toolbar], rendered inside this same wrapper so it can be
    // positioned relative to the block): its buttons must receive their own
    // click normally, so this returns early for anything inside it instead
    // of also intercepting those.
    onClickCapture: (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.closest?.('[data-block-toolbar]')) return
      e.preventDefault()
      e.stopPropagation()
      emit('select', block.id)
    },
    onMouseenter: () => emit('hover', block.id),
    onMouseleave: () => emit('hover', null),
  }
}
</script>

<style scoped>
.canvas-toolbar-btn {
  @apply flex h-6 w-6 items-center justify-center rounded text-stone-500 transition hover:bg-stone-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30;
}
</style>
