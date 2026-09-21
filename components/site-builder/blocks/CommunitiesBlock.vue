<template>
  <section v-reveal class="mx-auto max-w-screen-2xl px-6 py-16 lg:px-10">
    <div class="flex items-end justify-between">
      <div>
        <SbText tag="p" field="eyebrow" kind="eyebrow" label="Etiqueta" class="eyebrow" :text="content.eyebrow || ''" />
        <SbText tag="h2" field="title" kind="heading" label="Título" class="heading-serif mt-3 text-3xl md:text-4xl" :text="content.title || ''" />
      </div>
      <SbLink v-if="content.cta && content.ctaTo" field="cta" link-field="ctaTo" label="Botón" :to="content.ctaTo" class="btn-quiet hidden shrink-0 md:inline-flex" :text="content.cta" />
    </div>
    <div class="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <SbBox
        v-for="c in items"
        :key="c.id"
        :tag="NuxtLink"
        :tag-props="{ to: `/zonas/${c.id}` }"
        field="card"
        label="Tarjeta de comunidad"
        :dynamic="dynamicLabel('community', 'Comunidad')"
        :source-href="SOURCES.community.href"
        class="group relative block aspect-[3/2] overflow-hidden rounded-2xl bg-stone-100"
      >
        <SbImage field="card.image" label="Imagen de la comunidad" :dynamic="dynamicLabel('community', 'Imagen')" :source-href="SOURCES.community.href" :src="mediaUrl(c.image)" :alt="c.name" class="h-full w-full object-cover transition duration-700 group-hover:scale-105" loading="lazy" />
        <div class="absolute inset-0 flex items-end bg-gradient-to-t from-black/70 via-black/10 to-transparent p-6">
          <div>
            <SbText tag="h3" field="card.name" kind="heading" label="Nombre de la comunidad" :dynamic="dynamicLabel('community', 'Nombre')" :source-href="SOURCES.community.href" class="font-serif text-2xl font-medium text-white" :text="c.name" />
            <SbText v-if="c.location" tag="p" field="card.location" kind="caption" label="Ubicación" :dynamic="dynamicLabel('community', 'Ubicación')" :source-href="SOURCES.community.href" class="mt-1 text-[11px] font-semibold uppercase tracking-widest2 text-white/70" :text="c.location" />
          </div>
        </div>
      </SbBox>
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
const props = defineProps<{ content: Record<string, any>; communities: any[] }>()
const items = computed(() => {
  const all = props.communities || []
  const limit = Number(props.content.limit) || 6
  if (props.content.source === 'manual') {
    const ids: number[] = Array.isArray(props.content.manualIds) ? props.content.manualIds : []
    const byId = new Map(all.map((c) => [c.id, c]))
    return ids.map((id) => byId.get(id)).filter(Boolean).slice(0, limit)
  }
  return all.slice(0, limit)
})
</script>
