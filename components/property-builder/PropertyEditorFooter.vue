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

    <!-- Guardar, al final de cada apartado y independiente de Anterior/Siguiente.
         El estado dice lo que de verdad pasa: «Guardado correctamente» sólo
         cuando el servidor lo ha confirmado. Con la propiedad ya creada,
         además se autoguarda; con una nueva, el primer «Guardar» crea el
         registro (con lo mínimo imprescindible). -->
    <div v-if="canEdit" class="order-last flex w-full flex-wrap items-center justify-center gap-3 sm:order-none sm:w-auto sm:flex-1" data-testid="property-editor-guardar-area">
      <p class="text-[12px]" :class="stateClass" role="status" aria-live="polite" data-testid="property-editor-guardar-estado" :data-state="state">{{ stateText }}</p>
      <button type="button" class="pe-btn-dark !px-5" data-testid="property-editor-guardar" :disabled="saving" @click="emit('save')">
        {{ saving ? 'Guardando…' : 'Guardar' }}
      </button>
    </div>

    <button v-if="hasNext" type="button" class="pe-btn-dark !px-5" data-testid="property-editor-next" @click="emit('next')">
      Siguiente <span aria-hidden="true">→</span>
    </button>
    <span v-else />

    <p class="order-last w-full text-center text-[12px] text-stone-450" data-testid="property-editor-hint">{{ hint }}</p>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  hasPrev: boolean
  hasNext: boolean
  saving: boolean
  hint: string
  canEdit: boolean
  /** idle: propiedad nueva sin tocar · saved: sin cambios · dirty: cambios pendientes · error. */
  state: 'idle' | 'saving' | 'saved' | 'dirty' | 'error'
  /** El mensaje del error del último guardado, si lo hubo. */
  error?: string
}>()
const emit = defineEmits<{ prev: []; next: []; save: [] }>()

const stateText = computed(() => {
  switch (props.state) {
    case 'saving':
      return 'Guardando…'
    case 'dirty':
      return 'Cambios pendientes'
    case 'error':
      return props.error ? `Error al guardar: ${props.error}` : 'Error al guardar'
    case 'saved':
      return 'Sin cambios'
    default:
      return 'Todavía sin guardar'
  }
})
const stateClass = computed(() => (props.state === 'error' ? 'font-medium text-red-600' : props.state === 'dirty' ? 'text-amber-700' : 'text-stone-450'))
</script>
