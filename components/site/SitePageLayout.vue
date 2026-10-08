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

// Import estático, a propósito: con `defineAsyncComponent` el SSR no pintaba
// las secciones (la página llegaba vacía y el navegador la rellenaba al
// hidratar, con aviso de desajuste: mala primera carga y mal SEO). La portada
// ya lo importa igual, así que el trozo de JS es el mismo.
import SiteBlockRenderer from '~/components/site-builder/SiteBlockRenderer.vue'

defineProps<{ page: PublishedSitePage | null | undefined; homeData?: any }>()
</script>
