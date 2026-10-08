<template>
  <section class="pcard min-w-0 scroll-mt-28">
    <h2 class="pcard-title">{{ title }}</h2>
    <p v-if="subtitle" class="mt-1 max-w-2xl text-[13px] text-stone-500">{{ subtitle }}</p>
    <div class="mt-4">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * El resto de secciones de la ficha (#111) con el mismo lenguaje que las de
 * arriba: tarjeta blanca, borde muy claro y título en negrita. El `id`, el
 * `order` del Constructor y el `v-if` se ponen desde la página.
 */
defineProps<{ title: string; subtitle?: string }>()
</script>
