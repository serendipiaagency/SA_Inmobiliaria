<template>
  <div class="space-y-2">
    <!-- Colores de marca (Brand Kit): se guardan como ROL (text/primary/…), así
         siguen vinculados a la marca de la agencia y no como HEX fijo. -->
    <div v-if="brandRoles.length">
      <p class="mb-1 text-[11px] text-stone-400">Colores de marca</p>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="r in brandRoles"
          :key="r.value"
          type="button"
          class="flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px]"
          :class="modelValue === r.value ? 'border-ink bg-stone-50 font-medium' : 'border-line hover:bg-stone-50'"
          @click="select(r.value)"
        >
          <span class="h-3 w-3 rounded-full border border-black/10" :style="{ background: r.preview }" />
          {{ r.label }}
        </button>
      </div>
    </div>

    <!-- Predefinidos -->
    <div>
      <p class="mb-1 text-[11px] text-stone-400">Predefinidos</p>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="c in PRESETS"
          :key="c"
          type="button"
          class="h-5 w-5 rounded-full border border-black/10 transition"
          :class="isHex(modelValue) && sameHex(modelValue, c) ? 'ring-2 ring-ink ring-offset-1' : 'hover:scale-110'"
          :style="{ background: c }"
          :title="c"
          @click="select(c)"
        />
      </div>
    </div>

    <!-- Color personalizado: selector visual + HEX -->
    <div>
      <p class="mb-1 text-[11px] text-stone-400">Personalizado</p>
      <div class="flex items-center gap-2">
        <input
          type="color"
          :value="hexValue"
          class="h-8 w-10 shrink-0 cursor-pointer rounded border border-line bg-white p-0.5"
          @input="select(($event.target as HTMLInputElement).value)"
        >
        <input
          :value="isHex(modelValue) ? modelValue.toUpperCase() : ''"
          placeholder="#0B3854"
          maxlength="7"
          spellcheck="false"
          class="w-24 rounded-lg border border-line bg-white px-2 py-1.5 font-mono text-xs uppercase focus:border-ink"
          @change="onHexInput(($event.target as HTMLInputElement).value)"
        >
        <button v-if="modelValue" type="button" class="ml-auto text-[11px] text-stone-400 hover:text-ink" @click="select('')">Por defecto</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Selector de color del editor visual (reforma de editores). Tres orígenes:
 * (1) colores del Brand Kit de la agencia —guardados como ROL dinámico, no como
 * HEX, para que sigan la marca—, (2) predefinidos, (3) color libre (selector
 * visual del navegador + campo HEX). El valor es «» (por defecto), un rol
 * (`text`/`primary`/`secondary`/`background`/`accent`) o un HEX `#rrggbb`. El
 * renderer (server/utils/assetExport/pdfRenderer.ts → resolveColor) entiende
 * los tres, así que el color elegido se conserva en el PDF exportado. Elegir un
 * color aquí NO modifica el Brand Kit global.
 */
interface BrandColors {
  colorPrimary?: string | null
  colorSecondary?: string | null
  colorBackground?: string | null
  colorText?: string | null
}

const props = defineProps<{ modelValue: string; brandColors?: BrandColors | null }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const PRESETS = ['#0B3854', '#1A1A18', '#4B5563', '#9CA3AF', '#FFFFFF', '#B91C1C', '#C2410C', '#B45309', '#15803D', '#1D4ED8']

// Roles del Brand Kit con su color real (si la agencia lo tiene configurado).
// Sin Brand Kit, no se muestran roles (no se inventan colores de marca).
const ROLE_DEFS: Array<{ value: string; label: string; key: keyof BrandColors }> = [
  { value: 'text', label: 'Texto', key: 'colorText' },
  { value: 'primary', label: 'Principal', key: 'colorPrimary' },
  { value: 'secondary', label: 'Secundario', key: 'colorSecondary' },
  { value: 'background', label: 'Fondo', key: 'colorBackground' },
]
const brandRoles = computed(() =>
  props.brandColors
    ? ROLE_DEFS.filter((r) => !!props.brandColors![r.key]).map((r) => ({ value: r.value, label: r.label, preview: props.brandColors![r.key] as string }))
    : [],
)

function isHex(v: string | null | undefined): v is string {
  return !!v && /^#?[0-9a-fA-F]{6}$/.test(v.trim())
}
function normHex(v: string) {
  const h = v.trim()
  return (h.startsWith('#') ? h : `#${h}`).toLowerCase()
}
function sameHex(a: string, b: string) {
  return normHex(a) === normHex(b)
}
// El <input type=color> necesita siempre un #rrggbb; si el valor es un rol o
// está vacío, muestra el color real del rol o negro como punto de partida.
const hexValue = computed(() => {
  if (isHex(props.modelValue)) return normHex(props.modelValue)
  const role = ROLE_DEFS.find((r) => r.value === props.modelValue)
  const fromBrand = role && props.brandColors?.[role.key]
  return isHex(fromBrand || '') ? normHex(fromBrand as string) : '#1a1a18'
})

function select(v: string) {
  emit('update:modelValue', isHex(v) ? normHex(v) : v)
}
function onHexInput(v: string) {
  if (!v.trim()) return select('')
  if (isHex(v)) select(v)
}
</script>
