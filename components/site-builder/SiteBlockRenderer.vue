<template>
  <div>
    <div
      v-for="block in visibleBlocks"
      :key="block.id"
      v-bind="wrapperAttrs(block)"
    >
      <span
        v-if="mode === 'builder'"
        class="pointer-events-none absolute left-2 top-2 z-10 rounded bg-blue-500 px-1.5 py-0.5 text-[10px] font-semibold text-white opacity-0 shadow transition-opacity group-hover:opacity-100"
      >
        {{ blockLabel(block.type) }}
      </span>
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

const emit = defineEmits<{ select: [id: string]; hover: [id: string | null] }>()

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
    onClickCapture: (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      emit('select', block.id)
    },
    onMouseenter: () => emit('hover', block.id),
    onMouseleave: () => emit('hover', null),
  }
}
</script>
