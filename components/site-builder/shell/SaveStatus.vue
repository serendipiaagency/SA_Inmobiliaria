<template>
  <p class="flex items-center gap-1 text-[11px] font-medium" :class="COLOR[state]">
    <svg v-if="state === 'saving'" class="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9" />
    </svg>
    <svg v-else-if="state === 'saved'" class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="m4 12 5 5L20 6" />
    </svg>
    <svg v-else-if="state === 'error'" class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v5M12 16h.01" /><circle cx="12" cy="12" r="9" />
    </svg>
    {{ LABEL[state] }}
  </p>
</template>

<script setup lang="ts">
// Autosave status only — kept visually and semantically separate from
// publish (TopBar's own CTA): "Guardado" means the draft persisted, not
// that the public site changed. See docs/site-builder.md.
defineProps<{ state: 'idle' | 'saving' | 'saved' | 'error' }>()

const LABEL: Record<string, string> = { idle: '', saving: 'Guardando…', saved: 'Guardado', error: 'Error al guardar' }
const COLOR: Record<string, string> = { idle: 'text-stone-300', saving: 'text-stone-400', saved: 'text-emerald-600', error: 'text-red-500' }
</script>
