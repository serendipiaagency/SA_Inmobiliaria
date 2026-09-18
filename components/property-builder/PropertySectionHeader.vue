<template>
  <div class="flex items-start justify-between gap-4 px-6 pb-5 pt-6 sm:px-8">
    <div class="min-w-0">
      <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400" data-testid="property-editor-step-indicator">Paso {{ index + 1 }} de {{ total }}</p>
      <h2 class="mt-2 text-[28px] font-semibold leading-tight tracking-tight text-ink" data-testid="property-editor-section-title">{{ label }}</h2>
      <p class="mt-1 text-[13px] text-stone-500">{{ description }}</p>
    </div>
    <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" v-html="icon" />
    </span>
  </div>
</template>

<script setup lang="ts">
/**
 * La cabecera de una sección: "Paso n de N", título, una línea de
 * explicación y el distintivo con el icono de la sección.
 *
 * `v-html` sólo recibe el `path` de un icono del mapa cerrado que define el
 * editor — nunca contenido de la propiedad ni nada que escriba un usuario.
 */
defineProps<{ index: number; total: number; label: string; description: string; icon: string }>()
</script>
