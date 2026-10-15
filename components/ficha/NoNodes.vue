<template>
  <slot />
</template>

<script setup lang="ts">
import { SITE_BLOCK_KEY, type SiteBlockContext } from '~/composables/useSiteEditor'

/**
 * Lo que la ficha reutiliza de otras partes de la web (las tarjetas de las
 * propiedades similares) tiene sus propios nodos del Constructor, pensados para
 * la portada. Dentro de la ficha editable no son elementos de la plantilla:
 * este componente retira el bloque al que pertenecerían para que no sean
 * seleccionables ni estilizables desde aquí.
 */
provide(SITE_BLOCK_KEY, null as unknown as SiteBlockContext)
</script>
