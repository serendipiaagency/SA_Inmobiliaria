<template>
  <section v-reveal class="mx-auto max-w-screen-2xl px-6 py-20 lg:px-10 lg:py-28" data-testid="services-block">
    <div class="grid gap-12 lg:grid-cols-12 lg:gap-16">
      <!-- Columna editorial: etiqueta sin fondo, titular serif, introducción y
           una fotografía opcional con recorte orgánico. -->
      <div class="lg:col-span-5">
        <!-- Eyebrow SIN fondo (a diferencia de `.eyebrow`, que es una píldora):
             una etiqueta en versalitas con el color de marca, o la tinta de la web. -->
        <SbText
          v-if="content.eyebrow"
          tag="p"
          field="eyebrow"
          kind="eyebrow"
          label="Etiqueta"
          class="text-[11px] font-semibold uppercase tracking-widest2"
          :style="eyebrowStyle"
          :text="content.eyebrow"
        />
        <SbText tag="h2" field="title" kind="heading" label="Título" class="heading-serif mt-4 max-w-md text-4xl leading-[1.08] md:text-5xl" :text="content.title || ''" />
        <SbText v-if="content.text" tag="p" field="text" label="Introducción" multiline class="mt-6 max-w-md text-[15px] leading-relaxed text-stone-500" :text="content.text" />

        <div v-if="content.image" class="mt-10" data-testid="services-photo">
          <div class="services-organic aspect-[4/5] w-full overflow-hidden bg-stone-100">
            <SbImage field="image" alt-field="imageAlt" label="Fotografía" :src="mediaUrl(content.image)" :alt="content.imageAlt || ''" class="h-full w-full object-cover" loading="lazy" />
          </div>
        </div>
      </div>

      <!-- Columna de servicios: hasta seis, cada uno con su icono, título y explicación. -->
      <div class="lg:col-span-7">
        <div v-if="services.length" class="grid gap-x-10 gap-y-10 sm:grid-cols-2" data-testid="services-list">
          <article v-for="s in services" :key="s.index" class="border-t border-line pt-5" :data-testid="`service-${s.index}`">
            <span v-if="iconSvg(s.icon)" class="mb-3 inline-flex text-ink" :style="iconStyle" aria-hidden="true" v-html="iconSvg(s.icon)" />
            <SbText tag="h3" :field="`service${s.index}Title`" kind="heading" label="Servicio" class="font-serif text-xl font-medium text-ink" :text="s.title" />
            <SbText v-if="s.text" tag="p" :field="`service${s.index}Text`" label="Explicación" multiline class="mt-2 text-[14px] leading-relaxed text-stone-500" :text="s.text" />
          </article>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import SbText from '../nodes/SbText.vue'
import SbImage from '../nodes/SbImage.vue'
import { resolveServices } from '~/utils/corporateBlocks'
import { featureIconSvg } from '~/utils/featureIcons'
import { TENANT_BRANDING_OVERRIDE } from '~/composables/useTenant'

/**
 * «Servicios» (Cola 25): lo que la agencia hace por quien la visita, en una
 * composición editorial a dos columnas —etiqueta sin fondo, titular serif y
 * una fotografía con recorte orgánico a la izquierda; hasta seis servicios
 * con su icono a la derecha—. Cada servicio lleva un icono del catálogo de
 * iconos de línea del proyecto (utils/featureIcons.ts), pintado con el color
 * de marca del Brand Kit cuando lo hay. Un servicio sin título no se pinta:
 * la agencia enseña sólo los que ofrece, sin huecos vacíos.
 */
const props = defineProps<{ content: Record<string, any> }>()
const services = computed(() => resolveServices(props.content))

// Color de marca (Brand Kit). En el Constructor, la vista previa inyecta un
// override para enseñar el color elegido sin recargar.
const { tenant } = useTenant()
const brandingOverride = inject(TENANT_BRANDING_OVERRIDE, null)
const brandColor = computed(() => brandingOverride?.value?.brandColor ?? tenant.value?.brandColor ?? null)

// Icono y etiqueta con el color de marca; sin marca, la tinta de la web.
const iconStyle = computed(() => (brandColor.value ? { color: brandColor.value } : undefined))
const eyebrowStyle = computed(() => (brandColor.value ? { color: brandColor.value } : undefined))

// El SVG es marcado fijo del fichero de iconos, nunca datos de la agencia: v-html sin riesgo.
function iconSvg(key: string): string {
  return key ? featureIconSvg(key, 26) : ''
}
</script>

<style scoped>
/* Recorte orgánico de la fotografía (Cola 25): un marco con esquinas
   asimétricas, el mismo lenguaje que el rediseño de «Por qué elegirnos». */
.services-organic {
  border-radius: 48% 52% 60% 40% / 55% 45% 55% 45%;
}
</style>
