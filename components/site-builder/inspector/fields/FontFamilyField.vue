<template>
  <label class="mb-3 block">
    <span class="label flex items-center justify-between">
      <span>{{ label }}<span v-if="overridden" class="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-blue-500 align-middle" title="Tiene un valor propio" /></span>
      <button v-if="overridden" type="button" class="text-[10px] font-semibold normal-case tracking-normal text-stone-400 hover:text-ink" @click.prevent="$emit('update:modelValue', undefined)">Restablecer</button>
    </span>
    <select :value="modelValue || ''" class="input" @change="onChange">
      <option value="">{{ inheritedLabel }}</option>
      <optgroup v-if="brandOptions.length" label="Fuentes de marca">
        <option v-for="f in brandOptions" :key="`brand-${f}`" :value="f">{{ f }}</option>
      </optgroup>
      <optgroup v-for="group in groups" :key="group.label" :label="group.label">
        <option v-for="f in group.fonts" :key="f.family" :value="f.family">{{ f.family }}</option>
      </optgroup>
    </select>
  </label>
</template>

<script setup lang="ts">
import { SITE_FONTS, isKnownFont } from '~/utils/siteBuilder/fonts'

/**
 * Selector de tipografía: primero "heredado" (con lo que se hereda, para que
 * no sea un misterio), después las fuentes del Brand Kit que estén en el
 * catálogo, y por último el catálogo entero por categoría. El valor vacío
 * significa "sin override" — no se guarda nada.
 */
const props = withDefaults(
  defineProps<{
    label: string
    modelValue: string | undefined
    /** Lo que se aplica si no hay override (p. ej. "Inter" o el estilo global). */
    inherited?: string
    brandFonts?: string[]
    overridden?: boolean
  }>(),
  { inherited: 'Inter', brandFonts: () => [], overridden: false },
)
const emit = defineEmits<{ 'update:modelValue': [value: string | undefined] }>()

const inheritedLabel = computed(() => `Heredado (${props.inherited})`)
const brandOptions = computed(() => [...new Set(props.brandFonts.filter(isKnownFont))])
const groups = computed(() => [
  { label: 'Sans serif', fonts: SITE_FONTS.filter((f) => f.category === 'sans') },
  { label: 'Serif', fonts: SITE_FONTS.filter((f) => f.category === 'serif') },
  { label: 'Display', fonts: SITE_FONTS.filter((f) => f.category === 'display') },
])

function onChange(e: Event) {
  const v = (e.target as HTMLSelectElement).value
  emit('update:modelValue', v || undefined)
}
</script>
