<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[9000] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" :data-testid="testId" @click.self="emit('close')" @keydown.esc="emit('close')">
      <div class="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" :class="wide ? 'sm:max-w-2xl' : 'sm:max-w-md'" role="dialog" aria-modal="true">
        <header class="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
          <div>
            <h3 class="text-sm font-semibold text-ink">{{ title }}</h3>
            <p v-if="sub" class="mt-0.5 text-xs text-stone-500">{{ sub }}</p>
          </div>
          <button type="button" class="rounded-lg p-1 text-stone-400 transition hover:bg-stone-100 hover:text-ink" aria-label="Cerrar" @click="emit('close')">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <slot />
        </div>
        <footer v-if="$slots.footer" class="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/** Ventana modal del Centro de Comunicaciones: cabecera, cuerpo con scroll y pie de botones. */
withDefaults(defineProps<{ title: string; sub?: string; wide?: boolean; testId?: string }>(), { sub: undefined, wide: false, testId: undefined })
const emit = defineEmits<{ close: [] }>()
</script>
