<template>
  <div class="mb-3">
    <span class="label">{{ label }}</span>
    <div class="grid grid-cols-6 gap-1.5" role="group" :aria-label="label">
      <!-- «Sin icono»: un servicio puede ir sin icono (una raya). -->
      <button
        type="button"
        class="flex aspect-square items-center justify-center rounded-lg border transition"
        :class="!modelValue ? 'border-ink ring-1 ring-ink text-ink' : 'border-line text-stone-400 hover:border-stone-400'"
        :aria-pressed="!modelValue"
        title="Sin icono"
        @click="emit('update:modelValue', '')"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
      </button>
      <button
        v-for="key in ICONS"
        :key="key"
        type="button"
        class="flex aspect-square items-center justify-center rounded-lg border transition"
        :class="modelValue === key ? 'border-ink ring-1 ring-ink text-ink' : 'border-line text-stone-500 hover:border-stone-400'"
        :aria-pressed="modelValue === key"
        :title="key"
        @click="emit('update:modelValue', key)"
        v-html="icon(key)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { FEATURE_ICON_KEYS, featureIconSvg } from '~/utils/featureIcons'

/**
 * Selector de icono para los servicios (Cola 25): una rejilla con una
 * selección cuidada de los iconos de línea del proyecto (utils/featureIcons.ts),
 * los que tienen sentido para describir lo que hace una inmobiliaria —comprar,
 * vender, valorar, reformar, asesorar…—, más «Sin icono». No se abre todo el
 * catálogo de iconos de ficha: muchos (baños, ascensor) no describen un
 * servicio y sólo añadirían ruido.
 */
defineProps<{ label: string; modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

// Selección cuidada, en el orden en que suele presentarse un servicio.
const CURATED = ['propertyType', 'area', 'street', 'community', 'concierge', 'renovation', 'energyRating', 'building', 'garage', 'pool', 'garden', 'orientation', 'plot', 'facade', 'accessible', 'heating', 'status']
// Sólo las claves que existen de verdad en el catálogo, por si alguna se renombra.
const ICONS = CURATED.filter((k) => FEATURE_ICON_KEYS.includes(k))

function icon(key: string): string {
  return featureIconSvg(key, 18)
}
</script>
