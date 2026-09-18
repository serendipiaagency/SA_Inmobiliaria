<template>
  <div class="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-4 sm:px-8">
    <button
      v-if="hasPrev"
      type="button"
      class="pe-btn-quiet !px-4"
      data-testid="property-editor-prev"
      @click="emit('prev')"
    >
      <span aria-hidden="true">←</span> Anterior
    </button>
    <span v-else />

    <!-- El texto dice lo que de verdad pasa. Este editor NO autoguarda: los
         cambios viven en el formulario hasta que se pulsa Guardar, y
         prometer otra cosa haría que alguien cerrara la pestaña confiado. -->
    <p class="order-last w-full text-center text-[12px] text-stone-450 sm:order-none sm:w-auto sm:flex-1 sm:px-4" data-testid="property-editor-hint">
      {{ hint }}
    </p>

    <button v-if="hasNext" type="button" class="pe-btn-dark !px-5" data-testid="property-editor-next" @click="emit('next')">
      Siguiente <span aria-hidden="true">→</span>
    </button>
    <button v-else-if="canEdit" type="button" class="pe-btn-dark !px-5" data-testid="property-editor-finish" :disabled="saving" @click="emit('finish')">
      {{ saving ? 'Guardando…' : 'Finalizar' }}
      <svg v-if="!saving" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="m5 13 4 4L19 7" /></svg>
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{ hasPrev: boolean; hasNext: boolean; saving: boolean; hint: string; canEdit: boolean }>()
const emit = defineEmits<{ prev: []; next: []; finish: [] }>()
</script>
