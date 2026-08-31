<template>
  <div>
    <TextField label="Ancla (ID de sección)" :model-value="anchorId" hint="Para enlazar directamente a este bloque, p. ej. #contacto." placeholder="p. ej. contacto" @update:model-value="setAnchor" />
    <ColorSwatchField label="Fondo" :model-value="background" :options="BACKGROUND_OPTIONS" @update:model-value="(v) => setStyle('background', v)" />
    <div class="grid grid-cols-2 gap-3">
      <SelectField label="Espacio extra arriba" :model-value="paddingTop" :options="SPACING_OPTIONS" @update:model-value="(v) => setStyle('paddingTop', v)" />
      <SelectField label="Espacio extra abajo" :model-value="paddingBottom" :options="SPACING_OPTIONS" @update:model-value="(v) => setStyle('paddingBottom', v)" />
    </div>
    <div class="mt-1">
      <span class="label">Visible en</span>
      <div class="flex gap-4">
        <label v-for="d in DEVICES" :key="d.key" class="flex items-center gap-1.5 text-[13px] text-stone-600">
          <input type="checkbox" :checked="isVisible(d.key)" @change="setVisible(d.key, ($event.target as HTMLInputElement).checked)" >
          {{ d.label }}
        </label>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SiteBlock } from '~/server/utils/sitePages'
import TextField from './fields/TextField.vue'
import ColorSwatchField from './fields/ColorSwatchField.vue'
import SelectField from './fields/SelectField.vue'

const props = defineProps<{ block: SiteBlock }>()

const DEVICES = [
  { key: 'desktop' as const, label: 'Escritorio' },
  { key: 'tablet' as const, label: 'Tablet' },
  { key: 'mobile' as const, label: 'Móvil' },
]

const BACKGROUND_OPTIONS = [
  { value: '', label: 'Automático (del bloque)', swatchClass: 'bg-white bg-[linear-gradient(45deg,#e7e4de_25%,transparent_25%,transparent_75%,#e7e4de_75%),linear-gradient(45deg,#e7e4de_25%,transparent_25%,transparent_75%,#e7e4de_75%)] bg-[length:8px_8px] bg-[position:0_0,4px_4px]' },
  { value: 'paper', label: 'Papel', swatchClass: 'bg-paper' },
  { value: 'white', label: 'Blanco', swatchClass: 'bg-white' },
  { value: 'surface', label: 'Superficie', swatchClass: 'bg-surface' },
  { value: 'ink', label: 'Oscuro', swatchClass: 'bg-ink' },
]
const SPACING_OPTIONS = [
  { value: '', label: 'Ninguno' },
  { value: 'sm', label: 'Pequeño' },
  { value: 'lg', label: 'Grande' },
]

function setStyle(key: string, value: string) {
  if (!props.block.style) props.block.style = {}
  if (value) props.block.style[key] = value
  // A deleted key stays absent from the persisted block JSON, instead of
  // round-tripping as an explicit `key: undefined`.
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  else delete props.block.style[key]
}
function setAnchor(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  setStyle('anchorId', slug)
}

const anchorId = computed(() => props.block.style?.anchorId || '')
const background = computed(() => props.block.style?.background || '')
const paddingTop = computed(() => props.block.style?.paddingTop || '')
const paddingBottom = computed(() => props.block.style?.paddingBottom || '')

function isVisible(d: 'desktop' | 'tablet' | 'mobile') {
  return props.block.visibility?.[d] !== false
}
function setVisible(d: 'desktop' | 'tablet' | 'mobile', visible: boolean) {
  props.block.visibility = { ...props.block.visibility, [d]: visible }
}
</script>
