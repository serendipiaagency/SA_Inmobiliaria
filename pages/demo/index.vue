<template>
  <SiteBlockRenderer :blocks="page?.blocks || []" :home-data="data" mode="production" />
</template>

<script setup lang="ts">
import SiteBlockRenderer from '~/components/site-builder/SiteBlockRenderer.vue'

definePageMeta({ transparentHero: true })
const { data } = await useFetch('/api/public/home')
const { data: page } = await useFetch('/api/public/site-pages/home')

useHead(
  seoHead({
    title: page.value?.seo?.title || 'M&M Real Estate — Propiedades excepcionales',
    description:
      page.value?.seo?.description ||
      'Marketplace curado de proyectos off-plan, ventas de segunda mano y comunidades residenciales en los Emiratos Árabes Unidos.',
  }),
)
</script>
