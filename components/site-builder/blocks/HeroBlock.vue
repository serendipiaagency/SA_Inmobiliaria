<template>
  <HeroSearch
    :eyebrow="content.eyebrow"
    :title1="content.title1"
    :title2="content.title2"
    :subtitle="content.subtitle"
    :slides="slides"
    :explore-cta="content.exploreCta"
    :explore-cta-to="content.exploreCtaTo"
    :advisor-cta="content.advisorCta"
    :advisor-cta-to="content.advisorCtaTo"
    :overlay-opacity="content.overlayOpacity"
    :background-position="content.backgroundPosition"
    :content-align="content.contentAlign"
  />
</template>

<script setup lang="ts">
const props = defineProps<{ content: Record<string, any> }>()
// Slides can be a raw R2 upload key, a full /api/media/... path, or an
// external URL (the original hardcoded defaults) — mediaUrl() normalizes
// all three the same way every other image reference in this app does.
const slides = computed(() => (Array.isArray(props.content.slides) ? props.content.slides : []).map((s: string) => mediaUrl(s)))
</script>
