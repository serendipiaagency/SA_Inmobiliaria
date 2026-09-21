<template>
  <section v-reveal class="relative overflow-hidden bg-ink py-20 text-white">
    <SbImage v-if="content.image" field="image" label="Imagen de fondo" :src="mediaUrl(content.image)" alt="" class="absolute inset-0 h-full w-full object-cover opacity-30" loading="lazy" />
    <div class="relative mx-auto max-w-screen-md px-6 lg:px-10" :class="content.align === 'left' ? 'text-left' : 'text-center'">
      <SbText v-if="content.eyebrow" tag="p" field="eyebrow" kind="eyebrow" label="Etiqueta" class="eyebrow !text-white/60" :text="content.eyebrow" />
      <SbText v-if="content.title" tag="h2" field="title" kind="heading" label="Título" class="heading-serif mt-3 text-3xl text-white md:text-4xl" :text="content.title" />
      <SbText v-if="content.description" tag="p" field="description" label="Descripción" multiline class="mt-4 text-[15px] leading-relaxed text-white/70" :text="content.description" />
      <div class="mt-8 flex flex-wrap items-center gap-4" :class="content.align === 'left' ? '' : 'justify-center'">
        <SbLink
          v-if="content.ctaPrimary && content.ctaPrimaryTo"
          field="ctaPrimary"
          link-field="ctaPrimaryTo"
          label="Botón principal"
          :to="content.ctaPrimaryTo"
          class="inline-flex items-center bg-white px-6 py-3 text-[11px] font-semibold uppercase tracking-widest2 text-ink transition hover:bg-white/90"
          :text="content.ctaPrimary"
        />
        <SbLink
          v-if="content.ctaSecondary && content.ctaSecondaryTo"
          field="ctaSecondary"
          link-field="ctaSecondaryTo"
          label="Botón secundario"
          :to="content.ctaSecondaryTo"
          class="inline-flex items-center border border-white/40 px-6 py-3 text-[11px] font-semibold uppercase tracking-widest2 text-white transition hover:bg-white hover:text-ink"
          :text="content.ctaSecondary"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import SbText from '../nodes/SbText.vue'
import SbLink from '../nodes/SbLink.vue'
import SbImage from '../nodes/SbImage.vue'

defineProps<{ content: Record<string, any> }>()
</script>
