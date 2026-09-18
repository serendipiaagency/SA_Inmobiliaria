<template>
  <div class="pe-card overflow-hidden p-4" data-testid="property-editor-preview">
    <span class="inline-flex rounded-md bg-surface px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-450">Vista previa</span>

    <div class="mt-3 aspect-[4/3] overflow-hidden rounded-xl bg-surface">
      <img v-if="image && !imageFailed" :src="mediaUrl(image)" :alt="title" class="h-full w-full object-cover" @error="imageFailed = true" >
      <div v-else class="flex h-full w-full items-center justify-center px-4 text-center text-[12px] text-stone-400">
        {{ image ? 'No se pudo cargar la imagen' : 'Añade la imagen principal' }}
      </div>
    </div>

    <p class="mt-4 text-[15px] font-medium leading-snug text-ink" data-testid="property-editor-preview-title">{{ title }}</p>
    <p class="mt-1 text-[11px] uppercase tracking-[0.08em] text-stone-400">{{ reference }}</p>

    <dl class="mt-4 space-y-2.5 text-[13px]">
      <div v-for="row in rows" :key="row.label" class="flex items-baseline justify-between gap-3">
        <dt class="shrink-0 text-stone-500">{{ row.label }}</dt>
        <dd class="truncate text-right font-semibold text-ink">{{ row.value }}</dd>
      </div>
    </dl>

    <div class="mt-4 rounded-xl bg-surface px-3.5 py-3">
      <p class="text-[12px] font-semibold text-ink">{{ complete ? 'Ficha completa' : 'Ficha en progreso' }}</p>
      <p class="mt-0.5 text-[11px] leading-relaxed text-stone-500">
        Has completado {{ done }} de {{ total }} secciones.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * La tarjeta de vista previa del editor.
 *
 * Enseña **lo que hay en el formulario ahora mismo**, no una consulta
 * aparte: el editor le pasa los valores en vivo, así que escribir el precio
 * lo cambia aquí al instante. No guarda nada ni duplica la propiedad.
 *
 * Las filas (`rows`) las decide el editor según el catálogo, porque no son
 * las mismas: una promoción de obra nueva tiene entrega y promotora donde
 * una vivienda de segunda mano tiene operación y estado.
 */
const props = defineProps<{
  title: string
  reference: string
  image: string | null
  rows: { label: string; value: string }[]
  done: number
  total: number
  complete: boolean
}>()

/**
 * Una URL de imagen puede dejar de responder (un enlace externo caído, un
 * objeto borrado de R2). Sin esto, la tarjeta enseña el icono de imagen rota
 * del navegador con el texto alternativo encima, que parece un fallo del
 * editor; con esto cae en el mismo hueco que cuando no hay imagen y lo dice.
 */
const imageFailed = ref(false)
watch(() => props.image, () => (imageFailed.value = false))
</script>
