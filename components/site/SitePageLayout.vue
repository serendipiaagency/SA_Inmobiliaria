<template>
  <!-- Con versión publicada en el Constructor Web: sus secciones, y en el
       sitio de la zona dinámica (si la página la tiene) el contenido real
       que pasa la página. Sin ella: la página de siempre, tal cual. -->
  <SiteBlockRenderer v-if="page?.published" :blocks="page.blocks || []" :styles="page.styles || null" :home-data="homeData" mode="production">
    <template #core><slot /></template>
  </SiteBlockRenderer>
  <slot v-else />
</template>

<script setup lang="ts">
import type { PublishedSitePage } from '~/server/utils/sitePages'

// Asíncrono: el renderizador del Constructor (con todos sus bloques) sólo se
// descarga en las páginas que tienen una versión publicada; el resto de la
// web pesa lo mismo que antes.
const SiteBlockRenderer = defineAsyncComponent(() => import('~/components/site-builder/SiteBlockRenderer.vue'))

defineProps<{ page: PublishedSitePage | null | undefined; homeData?: any }>()
</script>
