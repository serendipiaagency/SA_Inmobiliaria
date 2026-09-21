<template>
  <section v-reveal class="mx-auto px-6 py-16 lg:px-10" :class="[MAX_WIDTH[content.maxWidth] || MAX_WIDTH.md, ALIGN[content.align] || ALIGN.left]">
    <SbText v-if="content.eyebrow" tag="p" field="eyebrow" kind="eyebrow" label="Etiqueta" class="eyebrow" :text="content.eyebrow" />
    <SbText v-if="content.title" tag="h2" field="title" kind="heading" label="Título" class="heading-serif mt-3 text-3xl md:text-4xl" :text="content.title" />
    <SbText v-if="content.subtitle" tag="p" field="subtitle" label="Subtítulo" class="mt-4 text-lg text-stone-600" :text="content.subtitle" />
    <SbText v-if="content.body" tag="p" field="body" label="Cuerpo" multiline class="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-stone-500" :class="content.columns === 2 ? 'sm:columns-2 sm:gap-8' : ''" :text="content.body" />
    <SbLink v-if="content.cta && content.ctaTo" field="cta" link-field="ctaTo" label="Botón" :to="content.ctaTo" class="btn-primary mt-6 inline-flex" :text="content.cta" />
  </section>
</template>

<script setup lang="ts">
import SbText from '../nodes/SbText.vue'
import SbLink from '../nodes/SbLink.vue'

defineProps<{ content: Record<string, any> }>()

const MAX_WIDTH: Record<string, string> = { sm: 'max-w-2xl', md: 'max-w-screen-md', lg: 'max-w-screen-lg', full: 'max-w-screen-2xl' }
const ALIGN: Record<string, string> = { left: 'text-left', center: 'text-center' }
</script>
