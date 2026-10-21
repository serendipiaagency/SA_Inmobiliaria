<template>
  <section v-reveal class="mx-auto max-w-screen-2xl px-6 py-20 lg:px-10 lg:py-28" data-testid="trust-points">
    <div class="grid gap-12 lg:grid-cols-12 lg:gap-16">
      <!-- Columna editorial: etiqueta sin fondo, titular serif, introducción y
           fotografía opcional con recorte orgánico. -->
      <div :class="content.image ? 'lg:col-span-5' : 'lg:col-span-4'">
        <SbText
          v-if="content.eyebrow"
          tag="p"
          field="eyebrow"
          kind="eyebrow"
          label="Etiqueta"
          class="text-[11px] font-semibold uppercase tracking-widest2"
          :style="brandTextStyle"
          :text="content.eyebrow"
        />
        <SbText tag="h2" field="title" kind="heading" label="Título" class="heading-serif mt-4 max-w-md text-4xl leading-[1.08] md:text-5xl" :text="content.title || ''" />
        <SbText v-if="content.text" tag="p" field="text" label="Introducción" multiline class="mt-6 max-w-md text-[15px] leading-relaxed text-stone-500" :text="content.text" />

        <div v-if="content.image" class="mt-10" data-testid="trust-points-photo">
          <div class="trust-organic aspect-[4/5] w-full overflow-hidden bg-stone-100">
            <SbImage field="image" alt-field="imageAlt" label="Fotografía" :src="mediaUrl(content.image)" :alt="content.imageAlt || ''" class="h-full w-full object-cover" loading="lazy" />
          </div>
        </div>
      </div>

      <!-- Las ventajas, en rejilla 2×2: cada una con su icono (color de marca)
           y su número, su título y su explicación. -->
      <div :class="content.image ? 'lg:col-span-7' : 'lg:col-span-8'">
        <div v-if="points.length" class="grid gap-x-10 gap-y-10 sm:grid-cols-2" data-testid="trust-points-list">
          <article v-for="p in points" :key="p.index" class="border-t border-line pt-5" :data-testid="`trust-point-${p.index}`">
            <div class="flex items-center gap-3">
              <span v-if="iconSvg(p.icon)" class="inline-flex text-ink" :style="brandTextStyle" aria-hidden="true" v-html="iconSvg(p.icon)" />
              <span class="font-serif text-sm text-stone-400" aria-hidden="true">{{ String(p.index).padStart(2, '0') }}</span>
            </div>
            <SbText tag="h3" :field="`point${p.index}Title`" kind="heading" label="Ventaja" class="mt-3 font-serif text-xl font-medium text-ink" :text="p.title" />
            <SbText v-if="p.text" tag="p" :field="`point${p.index}Text`" label="Explicación" multiline class="mt-2 text-[14px] leading-relaxed text-stone-500" :text="p.text" />
          </article>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import SbText from '../nodes/SbText.vue'
import SbImage from '../nodes/SbImage.vue'
import { resolveTrustPoints } from '~/utils/corporateBlocks'
import { featureIconSvg } from '~/utils/featureIcons'
import { TENANT_BRANDING_OVERRIDE } from '~/composables/useTenant'

/**
 * «Por qué elegirnos» (Cola 26, rediseño de «Nuestra experiencia, tu
 * tranquilidad»): las ventajas propias de la agencia —escritas por ella, no
 * una lista genérica— en una composición editorial a dos columnas. A la
 * izquierda, el titular y una fotografía con recorte orgánico; a la derecha,
 * las ventajas en una rejilla 2×2, cada una con su icono (del catálogo de
 * iconos de línea, pintado con el color de marca del Brand Kit cuando lo hay),
 * su número en serif, su título y su explicación. El icono es opcional: las
 * fichas antiguas sin icono siguen válidas, sólo con la numeración.
 */
const props = defineProps<{ content: Record<string, any> }>()
const points = computed(() => resolveTrustPoints(props.content))

// Color de marca (Brand Kit); en el Constructor, la vista previa lo inyecta.
const { tenant } = useTenant()
const brandingOverride = inject(TENANT_BRANDING_OVERRIDE, null)
const brandColor = computed(() => brandingOverride?.value?.brandColor ?? tenant.value?.brandColor ?? null)
const brandTextStyle = computed(() => (brandColor.value ? { color: brandColor.value } : undefined))

// SVG fijo del fichero de iconos, nunca datos de la agencia: v-html sin riesgo.
function iconSvg(key: string): string {
  return key ? featureIconSvg(key, 24) : ''
}
</script>

<style scoped>
/* Recorte orgánico de la fotografía (Cola 26): esquinas asimétricas, el mismo
   lenguaje que el bloque «Servicios». */
.trust-organic {
  border-radius: 48% 52% 60% 40% / 55% 45% 55% 45%;
}
</style>
