<template>
  <div>
    <SbText
      v-if="content.eyebrow"
      tag="p"
      field="eyebrow"
      kind="eyebrow"
      label="Etiqueta"
      class="text-[11px] font-semibold uppercase tracking-widest2"
      :style="brandTextStyle"
      :text="content.eyebrow"
    />
    <SbText
      v-if="content.title"
      tag="h2"
      field="title"
      kind="heading"
      label="Título"
      :class="['heading-serif mt-4 text-4xl leading-[1.08] md:text-5xl', centered ? 'mx-auto max-w-2xl' : '']"
      :text="content.title"
    />
    <SbText
      v-if="content.text"
      tag="p"
      field="text"
      label="Texto"
      multiline
      :class="['mt-6 whitespace-pre-line text-[15px] leading-relaxed text-stone-500', centered ? 'mx-auto max-w-xl' : '']"
      :text="content.text"
    />

    <!-- Cita destacada opcional: sobria, con un filete a la izquierda. -->
    <blockquote v-if="content.quote" :class="['mt-8 border-l-2 border-ink/20 pl-5', centered ? 'mx-auto max-w-xl text-left' : '']">
      <SbText tag="p" field="quote" label="Cita" multiline class="heading-serif text-xl leading-snug text-ink" :text="content.quote" />
      <SbText v-if="content.quoteAuthor" tag="footer" field="quoteAuthor" label="Autor de la cita" class="mt-2 text-[12px] font-semibold uppercase tracking-widest2 text-stone-400" :text="content.quoteAuthor" />
    </blockquote>

    <!-- Botón opcional. -->
    <div v-if="content.ctaLabel && content.ctaTo" :class="['mt-8', centered ? 'flex justify-center' : '']">
      <SbLink
        field="ctaLabel"
        link-field="ctaTo"
        label="Botón"
        :to="content.ctaTo"
        class="inline-flex items-center border border-ink/20 px-6 py-3 text-[11px] font-semibold uppercase tracking-widest2 text-ink transition hover:border-ink hover:bg-ink hover:text-white"
        :text="content.ctaLabel"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import SbText from '../../nodes/SbText.vue'
import SbLink from '../../nodes/SbLink.vue'

/**
 * Cuerpo editorial compartido por las cuatro composiciones de EditorialBlock:
 * etiqueta (color de marca), titular serif, prosa (párrafos separados por
 * líneas en blanco, `whitespace-pre-line`), cita opcional y botón opcional.
 * No es un bloque del registro (vive en blocks/parts/), sólo una pieza interna.
 */
defineProps<{ content: Record<string, any>; brandTextStyle?: Record<string, string>; centered?: boolean }>()
</script>
