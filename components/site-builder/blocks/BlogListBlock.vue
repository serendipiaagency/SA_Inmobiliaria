<template>
  <section v-if="items.length" v-reveal class="mx-auto max-w-screen-2xl px-6 py-16 lg:px-10">
    <div class="mb-8 flex items-end justify-between">
      <div>
        <SbText tag="p" field="eyebrow" kind="eyebrow" label="Etiqueta" class="eyebrow" :text="content.eyebrow || ''" />
        <SbText tag="h2" field="title" kind="heading" label="Título" class="heading-serif mt-3 text-3xl md:text-4xl" :text="content.title || ''" />
      </div>
      <SbLink v-if="content.cta" field="cta" link-field="ctaTo" label="Botón" :to="content.ctaTo || '/blog'" class="btn-quiet hidden md:inline-flex" :text="content.cta" />
    </div>
    <div class="grid gap-x-6 gap-y-10 md:grid-cols-3">
      <SbBox
        v-for="b in items"
        :key="b.id"
        :tag="NuxtLink"
        :tag-props="{ to: `/blog/${b.slug}` }"
        field="card"
        label="Tarjeta de artículo"
        :dynamic="dynamicLabel('blog', 'Artículo')"
        :source-href="SOURCES.blog.href"
        class="group block"
      >
        <div class="aspect-[3/2] overflow-hidden rounded-2xl bg-stone-100">
          <SbImage field="card.image" label="Imagen del artículo" :dynamic="dynamicLabel('blog', 'Imagen')" :source-href="SOURCES.blog.href" :src="mediaUrl(b.image)" :alt="b.title" class="h-full w-full object-cover transition duration-700 group-hover:scale-105" loading="lazy" />
        </div>
        <SbText tag="p" field="card.audience" kind="eyebrow" label="Público" :dynamic="dynamicLabel('blog', 'Público objetivo')" :source-href="SOURCES.blog.href" class="eyebrow mt-5" :text="b.targetAudience || ''" />
        <SbText tag="h3" field="card.title" kind="heading" label="Título del artículo" :dynamic="dynamicLabel('blog', 'Título')" :source-href="SOURCES.blog.href" class="mt-2 font-serif text-xl font-medium leading-snug group-hover:underline group-hover:underline-offset-4" :text="b.title || b.slug" />
      </SbBox>
    </div>
  </section>
</template>

<script setup lang="ts">
import SbText from '../nodes/SbText.vue'
import SbLink from '../nodes/SbLink.vue'
import SbImage from '../nodes/SbImage.vue'
import SbBox from '../nodes/SbBox.vue'
import { SOURCES, dynamicLabel } from '~/utils/siteBuilder/sources'

const NuxtLink = resolveComponent('NuxtLink')
const props = defineProps<{ content: Record<string, any>; blogs: any[] }>()
const items = computed(() => (props.blogs || []).slice(0, Number(props.content.limit) || 3))
</script>
