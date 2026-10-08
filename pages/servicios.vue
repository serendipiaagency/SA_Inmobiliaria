<template>
  <SitePageLayout :page="sitePage" :home-data="sitePageData" />
</template>

<script setup lang="ts">
/**
 * «Servicios» no existía en la web: es una página que la inmobiliaria monta
 * entera en el Constructor Web (utils/siteBuilder/pages.ts) y que existe
 * desde que la publica. Hasta entonces, esta dirección es un 404 normal.
 */
const { tenant, load: loadTenant } = useTenant()
await loadTenant()
const { page: sitePage, published, homeData: sitePageData } = await useSitePage('servicios')
if (!published.value) throw createError({ statusCode: 404, statusMessage: 'Página no encontrada', fatal: true })
useHead(
  seoHead({
    title: sitePage.value?.seo?.title || `Servicios — ${tenant.value?.companyName || tenant.value?.name}`,
    description: sitePage.value?.seo?.description || `Los servicios inmobiliarios de ${tenant.value?.companyName || tenant.value?.name}.`,
  }),
)
</script>
