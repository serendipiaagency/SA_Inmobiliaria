<template>
  <HeroSearch
    :eyebrow="content.eyebrow"
    :title1="content.title1"
    :title2="content.title2"
    :subtitle="content.subtitle"
    :slides="content.slides"
    :explore-cta="content.exploreCta"
    :explore-cta-to="content.exploreCtaTo"
    :advisor-cta="content.advisorCta"
    :advisor-cta-to="content.advisorCtaTo"
  />
</template>

<script setup lang="ts">
defineProps<{ content: Record<string, any> }>()
</script>
