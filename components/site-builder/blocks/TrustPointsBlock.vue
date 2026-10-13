<template>
  <section v-reveal class="mx-auto max-w-screen-2xl px-6 py-20 lg:px-10 lg:py-28" data-testid="trust-points">
    <div class="grid gap-12 lg:grid-cols-12 lg:gap-10">
      <div :class="content.image ? 'lg:col-span-7' : 'lg:col-span-12'">
        <SbText v-if="content.eyebrow" tag="p" field="eyebrow" kind="eyebrow" label="Etiqueta" class="eyebrow" :text="content.eyebrow" />
        <SbText tag="h2" field="title" kind="heading" label="Título" class="heading-serif mt-4 max-w-2xl text-4xl leading-[1.08] md:text-5xl" :text="content.title || ''" />
        <SbText v-if="content.text" tag="p" field="text" label="Introducción" multiline class="mt-6 max-w-xl text-[15px] leading-relaxed text-stone-500" :text="content.text" />

        <div v-if="points.length" class="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2" :class="points.length === 4 && !content.image ? 'lg:grid-cols-4' : points.length === 3 && !content.image ? 'lg:grid-cols-3' : ''" data-testid="trust-points-list">
          <article v-for="p in points" :key="p.index" class="border-t border-line pt-5" :data-testid="`trust-point-${p.index}`">
            <span class="font-serif text-sm text-stone-400" aria-hidden="true">{{ String(p.index).padStart(2, '0') }}</span>
            <SbText tag="h3" :field="`point${p.index}Title`" kind="heading" label="Argumento" class="mt-3 font-serif text-xl font-medium text-ink" :text="p.title" />
            <SbText v-if="p.text" tag="p" :field="`point${p.index}Text`" label="Explicación" multiline class="mt-2 text-[14px] leading-relaxed text-stone-500" :text="p.text" />
          </article>
        </div>
      </div>

      <div v-if="content.image" class="lg:col-span-5">
        <div class="aspect-[3/4] w-full overflow-hidden rounded-2xl bg-stone-100 sm:aspect-[4/3] lg:aspect-[3/4]" data-testid="trust-points-photo">
          <SbImage field="image" alt-field="imageAlt" label="Fotografía" :src="mediaUrl(content.image)" :alt="content.imageAlt || ''" class="h-full w-full object-cover" loading="lazy" />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import SbText from '../nodes/SbText.vue'
import SbImage from '../nodes/SbImage.vue'
import { resolveTrustPoints } from '~/utils/corporateBlocks'

/**
 * «Nuestra experiencia, tu tranquilidad» (docs/home-corporativa.md): tres o
 * cuatro argumentos propios de la agencia —escritos por ella, no una lista
 * genérica— con una fotografía opcional. Sin iconos decorativos: cada
 * argumento lleva su número en serif y un filete, como el resto de la web.
 */
const props = defineProps<{ content: Record<string, any> }>()
const points = computed(() => resolveTrustPoints(props.content))
</script>
