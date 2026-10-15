<template>
  <slot />
</template>

<script setup lang="ts">
import type { SiteBlock } from '~/server/utils/sitePages'
import { SITE_BLOCK_KEY } from '~/composables/useSiteEditor'

/**
 * La zona dinámica de una página funcional, en la web publicada, es la página
 * real que pasa quien usa el renderizador (slot `core`) y no lleva el marco del
 * bloque (SiteBlockFrame), que es lo que en el lienzo provee a sus nodos el id
 * del bloque. Este componente lo provee también en la web, sin pintar nada: así
 * los nodos de la ficha (composables/useFichaNodes.ts) llevan en producción el
 * `data-sb-node` que engancha los estilos que se les dieron en el Constructor.
 */
const props = defineProps<{ block: SiteBlock }>()

provide(SITE_BLOCK_KEY, {
  get id() {
    return props.block.id
  },
  get type() {
    return props.block.type
  },
})
</script>
