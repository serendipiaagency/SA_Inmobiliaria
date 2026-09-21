<template>
  <section v-if="types.length" v-reveal class="border-y border-line bg-white py-16">
    <div class="mx-auto max-w-screen-2xl px-6 lg:px-10">
      <SbText tag="p" field="eyebrow" kind="eyebrow" label="Etiqueta" class="eyebrow" :text="content.eyebrow || ''" />
      <SbText tag="h2" field="title" kind="heading" label="Título" class="heading-serif mt-3 text-3xl md:text-4xl" :text="content.title || ''" />
      <div class="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <SbBox
          v-for="pt in types"
          :key="pt"
          :tag="NuxtLink"
          :tag-props="{ to: { path: '/propiedades', query: { type: pt } } }"
          field="card"
          label="Tipo de propiedad"
          :dynamic="dynamicLabel('property', 'Tipo')"
          :source-href="SOURCES.property.href"
          class="flex items-center justify-between rounded-xl border border-line px-5 py-4 text-sm transition hover:border-ink hover:bg-paper"
        >
          <SbText tag="span" field="card.label" label="Nombre del tipo" :dynamic="dynamicLabel('property', 'Tipo')" :source-href="SOURCES.property.href" class="font-medium" :text="pt" />
          <span class="text-stone-400 transition group-hover:text-ink">→</span>
        </SbBox>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import SbText from '../nodes/SbText.vue'
import SbBox from '../nodes/SbBox.vue'
import { SOURCES, dynamicLabel } from '~/utils/siteBuilder/sources'

const NuxtLink = resolveComponent('NuxtLink')
const props = defineProps<{ content: Record<string, any>; projects: any[] }>()
const types = computed(() => [...new Set((props.projects || []).map((p) => p.propertyType).filter(Boolean))])
</script>
