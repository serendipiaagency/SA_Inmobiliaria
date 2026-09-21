<template>
  <section v-reveal class="border-y border-line bg-white">
    <div class="mx-auto grid max-w-screen-2xl gap-10 px-6 py-16 lg:grid-cols-2 lg:items-center lg:px-10">
      <div>
        <SbText tag="p" field="eyebrow" kind="eyebrow" label="Etiqueta" class="eyebrow" :text="content.eyebrow || ''" />
        <SbText tag="h2" field="title" kind="heading" label="Título" class="heading-serif mt-3 text-3xl md:text-4xl" :text="content.title || ''" />
        <SbText tag="p" field="text" label="Texto" multiline class="mt-4 max-w-md text-[15px] leading-relaxed text-stone-500" :text="content.text || ''" />
        <SbLink v-if="content.cta" field="cta" link-field="ctaTo" label="Botón" :to="content.ctaTo || '/propiedades'" class="btn-primary mt-8" :text="content.cta" />
      </div>
      <SbBox
        :tag="NuxtLink"
        :tag-props="{ to: content.ctaTo || '/propiedades' }"
        field="map"
        kind="box"
        label="Mapa"
        class="group relative block h-72 overflow-hidden rounded-2xl border border-line md:h-96"
      >
        <div class="absolute inset-0 bg-gradient-to-br from-stone-200 to-stone-300" />
        <div class="absolute inset-0" style="background-image:radial-gradient(circle,rgba(0,0,0,0.06) 1px,transparent 1px);background-size:28px 28px" />
        <span
          v-for="(pin, i) in content.pins || []"
          :key="i"
          class="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center transition-transform duration-300 group-hover:-translate-y-[110%]"
          :style="{ left: pin.x + '%', top: pin.y + '%' }"
        >
          <span class="whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-ink shadow">{{ pin.label }}</span>
          <span class="mt-1 h-3 w-3 rounded-full bg-ink ring-4 ring-white" />
        </span>
      </SbBox>
    </div>
  </section>
</template>

<script setup lang="ts">
import SbText from '../nodes/SbText.vue'
import SbLink from '../nodes/SbLink.vue'
import SbBox from '../nodes/SbBox.vue'

const NuxtLink = resolveComponent('NuxtLink')
defineProps<{ content: Record<string, any> }>()
</script>
