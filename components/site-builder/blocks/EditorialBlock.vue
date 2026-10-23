<template>
  <section v-reveal class="mx-auto max-w-screen-2xl px-6 py-20 lg:px-10 lg:py-28" data-testid="editorial">
    <!-- Dos columnas (imagen + texto): composición editorial con aire,
         imagen enmarcada con pie y, al lado, titular serif y prosa. -->
    <div
      v-if="hasSideImage"
      class="grid items-center gap-12 lg:grid-cols-2 lg:gap-20"
    >
      <figure :class="['min-w-0', content.layout === 'imageLeft' ? 'lg:order-1' : 'lg:order-2']" data-testid="editorial-figure">
        <div :class="['editorial-frame overflow-hidden bg-stone-100', ratioClass]">
          <SbImage field="image" alt-field="imageAlt" label="Fotografía" :src="mediaUrl(content.image)" :alt="content.imageAlt || ''" class="h-full w-full object-cover" loading="lazy" />
        </div>
        <SbText v-if="content.caption" tag="figcaption" field="caption" label="Pie de foto" class="mt-3 text-[13px] italic leading-relaxed text-stone-400" :text="content.caption" />
      </figure>

      <div :class="['min-w-0 max-w-xl', content.layout === 'imageLeft' ? 'lg:order-2' : 'lg:order-1']">
        <EditorialBody :content="content" :brand-text-style="brandTextStyle" />
      </div>
    </div>

    <!-- Imagen apilada arriba a todo el ancho (pie debajo), luego el texto. -->
    <div v-else-if="content.layout === 'stacked'" class="mx-auto max-w-5xl">
      <figure v-if="content.image" class="mb-12" data-testid="editorial-figure">
        <div :class="['editorial-frame overflow-hidden bg-stone-100', ratioClass]">
          <SbImage field="image" alt-field="imageAlt" label="Fotografía" :src="mediaUrl(content.image)" :alt="content.imageAlt || ''" class="h-full w-full object-cover" loading="lazy" />
        </div>
        <SbText v-if="content.caption" tag="figcaption" field="caption" label="Pie de foto" class="mt-3 text-[13px] italic leading-relaxed text-stone-400" :text="content.caption" />
      </figure>
      <div class="max-w-2xl">
        <EditorialBody :content="content" :brand-text-style="brandTextStyle" />
      </div>
    </div>

    <!-- Sólo texto, centrado: para intros y cierres narrativos. -->
    <div v-else class="mx-auto max-w-2xl text-center">
      <EditorialBody :content="content" :brand-text-style="brandTextStyle" centered />
    </div>
  </section>
</template>

<script setup lang="ts">
import SbImage from '../nodes/SbImage.vue'
import SbText from '../nodes/SbText.vue'
import EditorialBody from './parts/EditorialBody.vue'
import { TENANT_BRANDING_OVERRIDE } from '~/composables/useTenant'

/**
 * Bloque editorial reutilizable «Imagen y texto» (Cola 34, rediseño de «Sobre
 * nosotros»): una fotografía grande con pie y, junto a ella, etiqueta, titular
 * serif, prosa, cita opcional y botón opcional. Es la columna vertebral del
 * lenguaje editorial premium — sirve para «Presentación», «Nuestra historia»,
 * «Compromiso» y cualquier sección de imagen + texto. Cuatro composiciones:
 * imagen a la derecha (por defecto), a la izquierda, apilada a todo el ancho, o
 * sólo texto centrado. Todo el contenido es escrito por la agencia (nodos Sb*
 * estáticos), nada dinámico; respeta el Brand Kit para la etiqueta.
 */
const props = defineProps<{ content: Record<string, any> }>()

const hasSideImage = computed(() => !!props.content.image && (props.content.layout === 'imageLeft' || props.content.layout === 'imageRight' || !props.content.layout))

const RATIOS: Record<string, string> = { portrait: 'aspect-[4/5]', landscape: 'aspect-[16/10]', wide: 'aspect-[3/2]', square: 'aspect-square' }
const ratioClass = computed(() => RATIOS[props.content.imageRatio as string] || (props.content.layout === 'stacked' ? RATIOS.wide : RATIOS.portrait))

// Color de marca (Brand Kit) para la etiqueta; la vista previa lo inyecta.
const { tenant } = useTenant()
const brandingOverride = inject(TENANT_BRANDING_OVERRIDE, null)
const brandColor = computed(() => brandingOverride?.value?.brandColor ?? tenant.value?.brandColor ?? null)
const brandTextStyle = computed(() => (brandColor.value ? { color: brandColor.value } : undefined))
</script>

<style scoped>
/* Marco limpio y sobrio: un filete finísimo y una sombra muy sutil para
   «enmarcar» la fotografía sin recargar — más profesional que un borde duro. */
.editorial-frame {
  border-radius: 2px;
  box-shadow: 0 1px 2px rgba(20, 20, 16, 0.04), 0 18px 40px -24px rgba(20, 20, 16, 0.25);
  outline: 1px solid rgba(20, 20, 16, 0.06);
  outline-offset: -1px;
}
</style>
