<template>
  <SitePageLayout :page="shown" :home-data="sitePageData" />
</template>

<script setup lang="ts">
import type { PublishedSitePage } from '~/server/utils/sitePages'
import { seedPageBlocks } from '~/utils/siteBuilder/pages'

/**
 * «Vender Propiedad» (menú de la cabecera, utils/siteNav.ts): la página para
 * propietarios que quieren vender. Se edita en el Constructor Web
 * (utils/siteBuilder/pages.ts) y, a diferencia de Servicios, existe desde el
 * primer día: mientras no se publique una versión, enseña el contenido de
 * partida, el mismo con el que se abre en el editor. Su formulario crea el
 * lead de captación (`form: 'seller'`, server/api/public/contact.post.ts).
 */
const { tenant, load: loadTenant } = useTenant()
await loadTenant()
const { page: sitePage, published, homeData: sitePageData } = await useSitePage('vender')
const shown = computed<PublishedSitePage>(() => (published.value && sitePage.value ? sitePage.value : { published: true, blocks: seedPageBlocks('vender') as PublishedSitePage['blocks'], seo: {} }))
const company = computed(() => tenant.value?.companyName || tenant.value?.name || '')
useHead(
  seoHead({
    title: sitePage.value?.seo?.title || `Vender Propiedad — ${company.value}`,
    description: sitePage.value?.seo?.description || `Vende tu propiedad con ${company.value}: te ayudamos con el precio, las visitas y la negociación.`,
  }),
)
</script>
