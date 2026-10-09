<template>
  <HeroSearch
    :eyebrow="content.eyebrow"
    :title1="content.title1"
    :title2="content.title2"
    :subtitle="content.subtitle"
    :slides="slides"
    :background-mode="content.backgroundMode === 'static' ? 'static' : 'slideshow'"
    :background-image="backgroundImage"
    :overlay-opacity="content.overlayOpacity"
    :background-position="content.backgroundPosition"
    :content-align="content.contentAlign"
    :search-options="content"
  />
</template>

<script setup lang="ts">
const props = defineProps<{ content: Record<string, any> }>()
// Slides can be a raw R2 upload key, a full /api/media/... path, or an
// external URL (the original hardcoded defaults) — mediaUrl() normalizes
// all three the same way every other image reference in this app does.
const slides = computed(() => (Array.isArray(props.content.slides) ? props.content.slides : []).map((s: string) => mediaUrl(s)))
// «Imagen fija» (Multimedia): su imagen, o vacío para usar la primera del bucle.
const backgroundImage = computed(() => (props.content.backgroundImage ? mediaUrl(props.content.backgroundImage) : ''))
</script>
