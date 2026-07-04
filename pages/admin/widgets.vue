<template>
  <div>
    <div class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">Widgets embebibles</h1>
      <p class="mt-1 text-sm text-stone-500">Inserta tu cartera en cualquier web con un script</p>
    </div>

    <div class="rounded-xl border border-dashed border-line bg-white p-10 text-center">
      <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-stone-100 text-stone-400">
        <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z" /></svg>
      </span>
      <h2 class="mt-4 text-lg font-semibold">Próximamente — Bloque 8</h2>
      <p class="mx-auto mt-1 max-w-md text-sm text-stone-500">
        El generador de widgets embebibles (listado, carrusel, mapa, destacadas, luxury, alquiler…) con personalización de colores, tipografía y modo oscuro llega en el siguiente bloque del roadmap.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Widgets — SA Inmobiliaria' })
</script>
