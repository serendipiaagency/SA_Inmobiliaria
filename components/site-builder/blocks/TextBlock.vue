<template>
  <section v-reveal class="mx-auto px-6 py-16 lg:px-10" :class="[MAX_WIDTH[content.maxWidth] || MAX_WIDTH.md, ALIGN[content.align] || ALIGN.left]">
    <p v-if="content.eyebrow" class="eyebrow">{{ content.eyebrow }}</p>
    <h2 v-if="content.title" class="heading-serif mt-3 text-3xl md:text-4xl">{{ content.title }}</h2>
    <p v-if="content.subtitle" class="mt-4 text-lg text-stone-600">{{ content.subtitle }}</p>
    <p v-if="content.body" class="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-stone-500" :class="content.columns === 2 ? 'sm:columns-2 sm:gap-8' : ''">{{ content.body }}</p>
    <NuxtLink v-if="content.cta && content.ctaTo" :to="content.ctaTo" class="btn-primary mt-6 inline-flex">{{ content.cta }}</NuxtLink>
  </section>
</template>

<script setup lang="ts">
defineProps<{ content: Record<string, any> }>()

const MAX_WIDTH: Record<string, string> = { sm: 'max-w-2xl', md: 'max-w-screen-md', lg: 'max-w-screen-lg', full: 'max-w-screen-2xl' }
const ALIGN: Record<string, string> = { left: 'text-left', center: 'text-center' }
</script>
