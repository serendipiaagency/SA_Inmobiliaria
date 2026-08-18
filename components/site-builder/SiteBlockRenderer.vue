<template>
  <div>
    <div
      v-for="block in visibleBlocks"
      :key="block.id"
      v-bind="wrapperAttrs(block)"
    >
      <HeroBlock v-if="block.type === 'hero'" :content="block.content" />
      <MapTeaserBlock v-else-if="block.type === 'map-teaser'" :content="block.content" />
      <PropertiesBlock v-else-if="block.type === 'properties'" :content="block.content" :projects="homeData?.projects || []" />
      <CommunitiesBlock v-else-if="block.type === 'communities'" :content="block.content" :communities="homeData?.communities || []" />
      <PropertyTypesBlock v-else-if="block.type === 'property-types'" :content="block.content" :projects="homeData?.projects || []" />
      <MortgageBlock v-else-if="block.type === 'mortgage-calculator'" :content="block.content" :projects="homeData?.projects || []" />
      <BlogListBlock v-else-if="block.type === 'blog-list'" :content="block.content" :blogs="homeData?.blogs || []" />
      <div v-else-if="mode !== 'production'" class="mx-auto max-w-screen-2xl px-6 py-10 text-sm text-red-500">
        Tipo de bloque desconocido: {{ block.type }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SiteBlock } from '~/server/utils/sitePages'
import HeroBlock from './blocks/HeroBlock.vue'
import MapTeaserBlock from './blocks/MapTeaserBlock.vue'
import PropertiesBlock from './blocks/PropertiesBlock.vue'
import CommunitiesBlock from './blocks/CommunitiesBlock.vue'
import PropertyTypesBlock from './blocks/PropertyTypesBlock.vue'
import MortgageBlock from './blocks/MortgageBlock.vue'
import BlogListBlock from './blocks/BlogListBlock.vue'

/**
 * The one component that turns a page's block array into markup — used
 * identically by the public site (pages/demo/index.vue, mode="production")
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

function wrapperAttrs(block: SiteBlock) {
  if (props.mode !== 'builder') return {}
  const hiddenOnDevice = block.visibility && block.visibility[props.device] === false
  return {
    'data-site-block-id': block.id,
    'data-site-block-type': block.type,
    class: [
      'site-block-wrap relative outline-offset-[-2px] transition-[outline-color]',
      props.selectedBlockId === block.id ? 'outline outline-2 outline-blue-500' : 'outline outline-2 outline-transparent hover:outline-blue-300',
      hiddenOnDevice ? 'opacity-40' : '',
    ],
    onClick: (e: MouseEvent) => {
      e.stopPropagation()
      emit('select', block.id)
    },
    onMouseenter: () => emit('hover', block.id),
    onMouseleave: () => emit('hover', null),
  }
}
</script>
