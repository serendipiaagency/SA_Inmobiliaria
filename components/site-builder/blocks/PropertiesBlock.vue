<template>
  <!-- layout: row -->
  <SectionRow
    v-if="content.layout === 'row'"
    :eyebrow="content.eyebrow || ''"
    :title="content.title || ''"
    :items="items"
    :to="content.ctaTo || undefined"
    :cta="content.cta || undefined"
  />

  <!-- layout: dark-grid (Propiedades Premium) -->
  <section v-else-if="content.layout === 'dark-grid'" v-reveal class="bg-ink py-16 text-white">
    <div class="mx-auto max-w-screen-2xl px-6 lg:px-10">
      <div class="mb-8 flex items-end justify-between">
        <div>
          <SbText tag="p" field="eyebrow" kind="eyebrow" label="Etiqueta" class="eyebrow !text-white/50" :text="content.eyebrow || ''" />
          <SbText tag="h2" field="title" kind="heading" label="Título" class="mt-3 font-serif text-3xl font-medium md:text-4xl" :text="content.title || ''" />
        </div>
        <SbLink
          v-if="content.cta && content.ctaTo"
          field="cta"
          link-field="ctaTo"
          label="Botón"
          :to="content.ctaTo"
          class="hidden shrink-0 border border-white/40 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-widest2 transition hover:bg-white hover:text-ink md:inline-flex"
          :text="content.cta"
        />
      </div>
      <div class="grid gap-x-6 gap-y-10" :class="gridClasses">
        <SbBox
          v-for="p in items"
          :key="p.id"
          :tag="NuxtLink"
          :tag-props="{ to: `/propiedades/${p.slug || p.id}` }"
          field="card"
          label="Tarjeta de propiedad"
          :dynamic="dynamicLabel('property', 'Ficha')"
          :source-href="SOURCES.property.href"
          class="group block"
        >
          <div class="aspect-[4/3] overflow-hidden rounded-2xl bg-black/30">
            <SbImage field="card.image" label="Foto de la propiedad" :dynamic="dynamicLabel('property', 'Foto de portada')" :source-href="SOURCES.property.href" :src="mediaUrl(p.coverImage)" :alt="p.name" class="h-full w-full object-cover opacity-90 transition duration-700 group-hover:scale-105 group-hover:opacity-100" loading="lazy" />
          </div>
          <SbText v-if="cardFields.price" tag="p" field="card.price" label="Precio" :dynamic="dynamicLabel('property', 'Precio')" :source-href="SOURCES.property.href" class="mt-4 text-lg font-semibold" :text="formatPrice(p.price)" />
          <SbText v-if="cardFields.name" tag="h3" field="card.name" kind="heading" label="Nombre de la propiedad" :dynamic="dynamicLabel('property', 'Nombre')" :source-href="SOURCES.property.href" class="font-serif text-xl font-medium" :text="p.name" />
          <SbText v-if="cardFields.community && p.community" tag="p" field="card.community" kind="caption" label="Comunidad" :dynamic="dynamicLabel('property', 'Comunidad')" :source-href="SOURCES.property.href" class="text-[13px] text-white/60" :text="p.community" />
        </SbBox>
      </div>
    </div>
  </section>

  <!-- layout: ai-grid (IA recomienda) -->
  <section v-else-if="content.layout === 'ai-grid'" v-reveal class="border-t border-line bg-paper py-16">
    <div class="mx-auto max-w-screen-2xl px-6 lg:px-10">
      <div class="flex items-center gap-2">
        <SbText v-if="content.badge" tag="span" field="badge" kind="eyebrow" label="Insignia" class="rounded-full bg-ink px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest2 text-white" :text="content.badge" />
        <SbText tag="p" field="eyebrow" kind="eyebrow" label="Etiqueta" class="eyebrow !text-stone-450" :text="content.eyebrow || ''" />
      </div>
      <SbText tag="h2" field="title" kind="heading" label="Título" class="heading-serif mt-3 text-3xl md:text-4xl" :text="content.title || ''" />
      <div class="mt-8 grid gap-x-6 gap-y-10" :class="gridClasses">
        <ProjectCard v-for="p in items" :key="p.id" :project="p" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import SbText from '../nodes/SbText.vue'
import SbLink from '../nodes/SbLink.vue'
import SbImage from '../nodes/SbImage.vue'
import SbBox from '../nodes/SbBox.vue'
import { SOURCES, dynamicLabel } from '~/utils/siteBuilder/sources'

const NuxtLink = resolveComponent('NuxtLink')
const props = defineProps<{
  content: Record<string, any>
  projects: any[]
}>()

const items = computed(() => {
  const all = props.projects || []
  const limit = Number(props.content.limit) || 4
  if (props.content.source === 'manual') {
    const ids: number[] = Array.isArray(props.content.manualIds) ? props.content.manualIds : []
    const byId = new Map(all.map((p) => [p.id, p]))
    return ids.map((id) => byId.get(id)).filter(Boolean).slice(0, limit)
  }
  switch (props.content.dynamicFilter) {
    case 'featured': {
      const exclusive = all.filter((p) => p.isExclusive)
      return (exclusive.length ? exclusive : all).slice(0, limit)
    }
    case 'premium':
      return [...all].sort((a, b) => (b.price || 0) - (a.price || 0)).slice(0, limit)
    case 'affordable':
      return [...all].sort((a, b) => (a.price || 0) - (b.price || 0)).slice(0, limit)
    case 'recommended':
      return [...all].sort((a, b) => (b.rentalYield || 0) - (a.rentalYield || 0)).slice(0, limit)
    case 'community':
      return all.filter((p) => p.community === props.content.dynamicCommunity).slice(0, limit)
    case 'type':
      return all.filter((p) => p.propertyType === props.content.dynamicType).slice(0, limit)
    case 'latest':
    default:
      return all.slice(0, limit)
  }
})

const cardFields = computed(() => ({
  price: props.content.cardFields?.price !== false,
  name: props.content.cardFields?.name !== false,
  community: props.content.cardFields?.community !== false,
}))

// Tailwind's content scanner needs the full class string literally present
// somewhere in this file (it doesn't execute JS), so every mobile/tablet/
// desktop column count this block can produce is spelled out here, then
// picked by number below — not built with string interpolation.
const MOBILE_COLS: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2' }
const TABLET_COLS: Record<number, string> = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' }
const DESKTOP_COLS: Record<number, string> = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' }
const defaultCols = computed(() => (props.content.layout === 'ai-grid' ? { mobile: 1, tablet: 2, desktop: 4 } : { mobile: 1, tablet: 2, desktop: 3 }))
const gridClasses = computed(() => [
  MOBILE_COLS[Number(props.content.columnsMobile) || defaultCols.value.mobile] || MOBILE_COLS[defaultCols.value.mobile],
  TABLET_COLS[Number(props.content.columnsTablet) || defaultCols.value.tablet] || TABLET_COLS[defaultCols.value.tablet],
  DESKTOP_COLS[Number(props.content.columnsDesktop) || defaultCols.value.desktop] || DESKTOP_COLS[defaultCols.value.desktop],
])

const { format: formatPrice } = useCurrency()
</script>
