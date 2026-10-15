<template>
  <section class="pcard min-w-0 scroll-mt-28">
    <!-- Con `titleField`, el título es un texto fijo de la plantilla (ficha editable): se reescribe en el Constructor. -->
    <SbText v-if="titleField" tag="h2" class="pcard-title" :field="titleField" :text="title" kind="heading" :label="titleLabel" />
    <h2 v-else class="pcard-title">{{ title }}</h2>
    <p v-if="subtitle" class="mt-1 max-w-2xl text-[13px] text-stone-500">{{ subtitle }}</p>
    <div class="mt-4">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
import SbText from '~/components/site-builder/nodes/SbText.vue'
import { fichaNode } from '~/utils/siteBuilder/fichaNodes'

/**
 * El resto de secciones de la ficha (#111) con el mismo lenguaje que las de
 * arriba: tarjeta blanca, borde muy claro y título en negrita. El `id`, el
 * `order` del Constructor y el `v-if` se ponen desde la página.
 */
const props = defineProps<{ title: string; subtitle?: string; titleField?: string }>()
const titleLabel = computed(() => (props.titleField ? fichaNode(props.titleField)?.label : undefined))
</script>
