<template>
  <section v-reveal class="border-y border-line bg-white">
    <div class="mx-auto grid max-w-screen-2xl gap-10 px-6 py-16 lg:grid-cols-2 lg:items-center lg:px-10">
      <div>
        <SbText tag="p" field="eyebrow" kind="eyebrow" label="Etiqueta" class="eyebrow" :text="content.eyebrow || ''" />
        <SbText tag="h2" field="title" kind="heading" label="Título" class="heading-serif mt-3 text-3xl md:text-4xl" :text="content.title || ''" />
        <SbText tag="p" field="text" label="Texto" multiline class="mt-4 max-w-md text-[15px] leading-relaxed text-stone-500" :text="content.text || ''" />
        <SbLink v-if="content.cta" field="cta" link-field="ctaTo" label="Botón" :to="content.ctaTo || '/propiedades'" class="btn-primary mt-8" :text="content.cta" />
      </div>
      <SbBox
        field="map"
        kind="box"
        label="Mapa"
        :dynamic="dynamicLabel('property', 'Propiedades en el mapa')"
        :source-href="SOURCES.property.href"
        class="relative block h-72 overflow-hidden rounded-2xl border border-line md:h-96"
      >
        <ClientOnly>
          <MapTeaserMap :pins="pins" :mode="mode" />
          <template #fallback>
            <div class="absolute inset-0 bg-gradient-to-br from-stone-200 to-stone-300" />
            <div class="absolute inset-0" style="background-image:radial-gradient(circle,rgba(0,0,0,0.06) 1px,transparent 1px);background-size:28px 28px" />
          </template>
        </ClientOnly>
      </SbBox>
    </div>
  </section>
</template>

<script setup lang="ts">
import SbText from '../nodes/SbText.vue'
import SbLink from '../nodes/SbLink.vue'
import SbBox from '../nodes/SbBox.vue'
// MapTeaserMap.client.vue se usa por su nombre, sin `import` explícito, a
// propósito: Nuxt sólo excluye un `.client.vue` del bundle SSR cuando lo
// resuelve por su propio registro de auto-import de `components/` — un
// `import` manual del fichero (como aquí antes) se trata como un módulo
// cualquiera y viaja tal cual al bundle de servidor, donde el código de
// Leaflet toca `window` en cuanto se evalúa y tira el renderizado entero de
// cualquier página con este bloque (no sólo el mapa: la sección completa).
import { SOURCES, dynamicLabel } from '~/utils/siteBuilder/sources'
import { pickDynamicItems } from '~/utils/siteBuilder/pickItems'
import { withValidCoords } from '~/utils/maps/coords'

/**
 * Antes: un mapa decorativo con pines a mano (`content.pins`, posición en %).
 * Ahora: un mapa Leaflet real, con las propiedades reales que elija quien
 * edita (igual vocabulario que Propiedades — utils/siteBuilder/pickItems.ts),
 * ubicadas con sus coordenadas reales, nunca guardadas en el bloque. Un
 * bloque guardado con la forma antigua (sin `source`/`dynamicFilter`) cae en
 * el mismo "más recientes" por defecto que uno nuevo — no hace falta migrar
 * datos.
 */
const props = withDefaults(
  defineProps<{
    content: Record<string, any>
    projects?: any[]
    mode?: 'production' | 'builder' | 'preview'
  }>(),
  { projects: () => [], mode: 'production' },
)

const pins = computed(() => {
  const limit = Number(props.content.limit) || 6
  const picked = pickDynamicItems(props.projects || [], props.content, limit)
  return withValidCoords(picked)
})
</script>
