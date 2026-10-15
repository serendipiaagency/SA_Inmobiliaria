<template>
  <section v-reveal class="mx-auto max-w-screen-2xl px-6 py-16 lg:px-10" data-testid="zones-grid">
    <div class="max-w-3xl">
      <SbText v-if="content.eyebrow" tag="p" field="eyebrow" kind="eyebrow" label="Etiqueta" class="eyebrow" :text="content.eyebrow || ''" />
      <SbText tag="h2" field="title" kind="heading" label="Título" class="heading-serif mt-3 text-3xl md:text-4xl" :text="content.title || ''" />
      <SbText v-if="content.text" tag="p" field="text" kind="text" label="Subtítulo" class="mt-4 text-base leading-relaxed text-stone-500" :text="content.text" />
    </div>
    <div v-if="items.length" class="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <SbBox
        v-for="z in items"
        :key="z.id"
        :tag="NuxtLink"
        :tag-props="{ to: z.hasGuide ? z.path : z.catalogUrl }"
        field="card"
        label="Tarjeta de zona"
        :dynamic="dynamicLabel('zone', 'Zona')"
        :source-href="SOURCES.zone.href"
        class="zones-card group relative block aspect-[3/2] overflow-hidden rounded-2xl bg-stone-200"
        :data-testid="`zones-grid-card-${z.slug}`"
      >
        <SbImage v-if="z.image" field="card.image" label="Foto de la zona" :dynamic="dynamicLabel('zone', 'Foto')" :source-href="SOURCES.zone.href" :src="mediaUrl(z.image)" :alt="z.name" class="h-full w-full object-cover transition duration-700 group-hover:scale-105" loading="lazy" />
        <div class="absolute inset-0 flex items-end bg-gradient-to-t from-black/65 via-black/5 to-transparent p-6">
          <div>
            <span class="mb-3 block h-0.5 w-8 bg-white/85" aria-hidden="true" />
            <SbText tag="h3" field="card.name" kind="heading" label="Nombre de la zona" :dynamic="dynamicLabel('zone', 'Nombre')" :source-href="SOURCES.zone.href" class="font-serif text-3xl font-medium text-white" :text="z.name" />
          </div>
        </div>
      </SbBox>
    </div>
    <p v-else class="mt-8 text-sm text-stone-400">Todavía no hay zonas publicadas con prioridad en la portada (Portal Web → Zonas).</p>
    <div v-if="content.cta && content.ctaTo" class="mt-10">
      <SbLink field="cta" link-field="ctaTo" label="Botón" :to="content.ctaTo" class="btn-quiet" :text="content.cta" data-testid="zones-grid-cta" />
    </div>
  </section>
</template>

<script setup lang="ts">
import SbText from '../nodes/SbText.vue'
import SbLink from '../nodes/SbLink.vue'
import SbImage from '../nodes/SbImage.vue'
import SbBox from '../nodes/SbBox.vue'
import { SOURCES, dynamicLabel } from '~/utils/siteBuilder/sources'

/**
 * Bloque «Zonas» de la portada: rejilla fotográfica (3/2/1 columnas) de las
 * zonas publicadas con prioridad en la portada (Portal Web → Zonas), por
 * orden de prioridad. Cada tarjeta lleva a su guía (o al catálogo filtrado
 * si la zona no tiene guía). Sin iconos, sin cifras: la foto y el nombre.
 */
const NuxtLink = resolveComponent('NuxtLink')
const props = defineProps<{ content: Record<string, any>; zones: any[] }>()
const items = computed(() => (props.zones || []).slice(0, Number(props.content.limit) || 6))
</script>

<style scoped>
@media (prefers-reduced-motion: reduce) {
  .zones-card :deep(img) {
    transition: none;
  }
}
</style>
