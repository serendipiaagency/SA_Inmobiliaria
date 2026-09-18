<template>
  <div class="pe-card p-4" data-testid="property-editor-steps">
    <div class="mb-2 flex items-baseline justify-between px-1">
      <p class="text-[13px] font-medium text-stone-600">Progreso de la ficha</p>
      <p class="text-[13px] font-semibold tabular-nums text-ink" data-testid="property-editor-progress">{{ percent }}%</p>
    </div>
    <div class="mb-4 h-1 w-full overflow-hidden rounded-full bg-line">
      <div class="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-400 transition-all duration-500" :style="{ width: percent + '%' }" />
    </div>

    <nav class="space-y-0.5" aria-label="Secciones de la ficha">
      <button
        v-for="(s, i) in sections"
        :key="s.key"
        type="button"
        :data-testid="`property-editor-step-${s.key}`"
        class="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2.5 text-left text-[13px] font-medium transition"
        :class="active === s.key ? 'bg-ink text-white' : 'text-stone-600 hover:bg-surface'"
        :aria-current="active === s.key ? 'step' : undefined"
        @click="emit('select', s.key)"
      >
        <span
          class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold tabular-nums"
          :class="active === s.key ? 'bg-white/15 text-white' : 'bg-surface text-stone-450'"
        >
          {{ pad2(i + 1) }}
        </span>
        <span class="flex-1 truncate">{{ s.label }}</span>

        <!-- Un solo indicador por sección, y sólo cuando dice algo: error si
             falta un campo obligatorio, check si está completa. Una sección
             sin campos que seguir no muestra nada, en vez de fingir estado. -->
        <span
          v-if="states[s.key] === 'error'"
          class="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
          :class="active === s.key ? 'bg-amber-400/20 text-amber-200' : 'bg-red-50 text-red-600'"
          :title="`Faltan ${pending[s.key]} campo(s) obligatorio(s) en esta sección`"
        >
          {{ pending[s.key] }}
        </span>
        <svg
          v-else-if="states[s.key] === 'complete'"
          class="h-3.5 w-3.5 shrink-0"
          :class="active === s.key ? 'text-white' : 'text-emerald-500'"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="m5 13 4 4L19 7" />
        </svg>
      </button>
    </nav>
  </div>
</template>

<script setup lang="ts">
import type { BuilderSection } from '~/composables/usePropertyBuilderConfig'

/**
 * La columna de progreso y pasos del Property Editor.
 *
 * El porcentaje y el estado de cada paso **los calcula el editor sobre
 * campos reales** y se reciben ya resueltos: aquí no se deduce nada. En
 * concreto, entrar en una sección no la marca como completada — eso sería
 * un progreso decorativo.
 */
defineProps<{
  sections: BuilderSection[]
  active: string
  percent: number
  /** Estado por clave de sección, calculado por el editor. */
  states: Record<string, 'complete' | 'error' | 'neutral'>
  /** Cuántos campos obligatorios faltan, por clave de sección. */
  pending: Record<string, number>
}>()

const emit = defineEmits<{ select: [key: string] }>()

function pad2(n: number) {
  return String(n).padStart(2, '0')
}
</script>
