<template>
  <section v-reveal class="mx-auto max-w-screen-2xl px-6 py-20 lg:px-10 lg:py-28" data-testid="about-agency">
    <div class="grid gap-12 lg:grid-cols-12 lg:gap-10">
      <div class="lg:col-span-4 lg:pr-6">
        <SbText v-if="content.eyebrow" tag="p" field="eyebrow" kind="eyebrow" label="Etiqueta" class="eyebrow" :text="content.eyebrow" />
        <SbText tag="h2" field="title" kind="heading" label="Título" class="heading-serif mt-4 text-4xl leading-[1.08] md:text-5xl" :text="content.title || ''" />
        <SbText v-if="content.text" tag="p" field="text" label="Descripción" multiline class="mt-6 max-w-md text-[15px] leading-relaxed text-stone-500" :text="content.text" />
        <SbLink v-if="content.cta && content.ctaTo" field="cta" link-field="ctaTo" label="Botón" :to="content.ctaTo" class="btn-primary mt-8 inline-flex" :text="content.cta" />
      </div>

      <div :class="stats.length ? 'lg:col-span-5' : 'lg:col-span-8'">
        <div class="aspect-[4/3] w-full overflow-hidden rounded-2xl bg-stone-100" data-testid="about-agency-photo">
          <SbImage field="image" alt-field="imageAlt" label="Fotografía corporativa" :src="mediaUrl(content.image)" :alt="content.imageAlt || ''" class="h-full w-full object-cover" loading="lazy" />
        </div>
      </div>

      <dl v-if="stats.length" class="flex flex-col justify-center divide-y divide-line lg:col-span-3 lg:pl-6" data-testid="about-agency-stats">
        <div v-for="s in stats" :key="s.key" class="py-6 first:pt-0 last:pb-0" :data-testid="`about-agency-stat-${s.key}`">
          <SbText
            tag="dt"
            :field="s.live ? `stat.${s.key}` : `customValue${s.key.slice(-1)}`"
            kind="heading"
            :label="s.live ? 'Cifra (dato real de la cuenta)' : 'Cifra propia'"
            :dynamic="s.live ? statSource(s.key).dynamic : null"
            :source-href="s.live ? statSource(s.key).href : null"
            class="font-serif text-4xl font-medium leading-none text-ink md:text-5xl"
            :text="s.value"
          />
          <SbText
            tag="dd"
            :field="s.live ? `label${capitalize(s.key)}` : `customLabel${s.key.slice(-1)}`"
            kind="caption"
            label="Texto de la cifra"
            class="mt-2 text-[15px] leading-snug text-stone-500"
            :text="s.label"
          />
        </div>
      </dl>
    </div>
  </section>
</template>

<script setup lang="ts">
import SbText from '../nodes/SbText.vue'
import SbLink from '../nodes/SbLink.vue'
import SbImage from '../nodes/SbImage.vue'
import { SOURCES, dynamicLabel } from '~/utils/siteBuilder/sources'
import { resolveStats, type LiveStatKey } from '~/utils/corporateBlocks'

/**
 * «Conoce nuestra inmobiliaria» (docs/home-corporativa.md): la agencia
 * detrás del catálogo, en una composición editorial de tres columnas —texto
 * y botón, fotografía corporativa grande y, si las hay, hasta cuatro cifras.
 *
 * Las cifras «en vivo» son recuentos reales de la cuenta que llegan en
 * `company.stats` (/api/public/home); el bloque sólo guarda cuáles enseñar y
 * con qué etiqueta. Las cifras «propias» las escribe la agencia cuando tiene
 * un dato verificado que la plataforma no puede contar. Nada se inventa:
 * sin dato, la columna de cifras no existe y la foto ocupa su sitio.
 */
const props = defineProps<{ content: Record<string, any>; company?: { stats?: Partial<Record<LiveStatKey, number>> | null } | null }>()

const stats = computed(() => resolveStats(props.content, props.company?.stats))
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const STAT_SOURCE: Record<LiveStatKey, { dynamic: string; href: string }> = {
  team: { dynamic: dynamicLabel('team', 'Comerciales publicados (recuento)'), href: SOURCES.team.href },
  offices: { dynamic: dynamicLabel('office', 'Oficinas publicadas (recuento)'), href: SOURCES.office.href },
  properties: { dynamic: dynamicLabel('property', 'Viviendas publicadas (recuento)'), href: SOURCES.property.href },
  zones: { dynamic: dynamicLabel('zone', 'Guías de zona publicadas (recuento)'), href: SOURCES.zone.href },
  languages: { dynamic: dynamicLabel('team', 'Idiomas del equipo (recuento)'), href: SOURCES.team.href },
}
const statSource = (key: string) => STAT_SOURCE[key as LiveStatKey]
</script>
