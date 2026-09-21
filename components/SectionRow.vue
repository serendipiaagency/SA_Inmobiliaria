<template>
  <section v-reveal class="mx-auto max-w-screen-2xl px-6 py-14 lg:px-10">
    <div class="mb-8 flex items-end justify-between gap-4">
      <div>
        <SbText tag="p" field="eyebrow" kind="eyebrow" label="Etiqueta" class="eyebrow" :text="eyebrow" />
        <SbText tag="h2" field="title" kind="heading" label="Título" class="heading-serif mt-3 text-3xl md:text-4xl" :text="title" />
      </div>
      <SbLink v-if="to" field="cta" link-field="ctaTo" label="Botón" :to="to" class="btn-quiet hidden shrink-0 md:inline-flex" :text="cta || 'Ver todas'" />
    </div>
    <div v-if="items.length" class="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <ProjectCard v-for="p in items" :key="p.id" :project="p" />
    </div>
    <p v-else class="text-stone-500">Próximamente.</p>
    <div v-if="to" class="mt-8 text-center md:hidden">
      <SbLink field="cta" link-field="ctaTo" label="Botón" :to="to" class="btn-quiet" :text="cta || 'Ver todas'" />
    </div>
  </section>
</template>

<script setup lang="ts">
// Los textos y el botón son nodos editables cuando esta fila la pinta el
// Constructor Web (bloque de Propiedades, diseño "Fila"); fuera de él —en
// /propiedades, /zonas— los mismos componentes no añaden nada.
import SbText from '~/components/site-builder/nodes/SbText.vue'
import SbLink from '~/components/site-builder/nodes/SbLink.vue'

defineProps<{ eyebrow: string; title: string; items: any[]; to?: string; cta?: string }>()
</script>
