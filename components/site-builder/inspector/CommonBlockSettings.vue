<template>
  <div>
    <TextField label="Ancla (ID de sección)" :model-value="anchorId" hint="Para enlazar directamente a este bloque, p. ej. #contacto." placeholder="p. ej. contacto" @update:model-value="setAnchor" />
    <ColorSwatchField label="Fondo" :model-value="background" :options="backgroundOptions" @update:model-value="(v) => setStyle('background', v)" />

    <!-- Imagen de fondo (Cola 27): global a cualquier bloque compatible. -->
    <div class="mt-2 rounded-lg border border-line p-2">
      <ImageField label="Imagen de fondo (opcional)" aspect="wide" :model-value="backgroundImage" @update:model-value="(v) => setStyle('backgroundImage', v)" />
      <template v-if="backgroundImage">
        <SegmentedField
          label="Encaje"
          :model-value="backgroundSize"
          :options="[{ value: 'cover', label: 'Rellenar' }, { value: 'contain', label: 'Encajar' }]"
          @update:model-value="(v) => setStyle('backgroundSize', v)"
        />
        <SelectField label="Posición" :model-value="backgroundPosition" :options="POSITION_OPTIONS" @update:model-value="(v) => setStyle('backgroundPosition', v)" />
        <ToggleField label="Repetir en mosaico" :model-value="backgroundRepeat" @update:model-value="setRepeat" />
        <p class="mb-1 mt-2 text-[11px] font-semibold uppercase tracking-widest2 text-stone-400">Superposición de color</p>
        <ColorField label="Color" :model-value="overlayColor" :brand-colors="brandColors" @update:model-value="setOverlayColor" />
        <SliderField v-if="overlayColor" label="Opacidad" :model-value="overlayOpacity" :min="0" :max="100" @update:model-value="setOverlayOpacity" />
        <p class="mt-1 text-[11px] text-stone-400">El «Fondo» de arriba se ve como color de respaldo detrás o alrededor de la imagen.</p>
      </template>
    </div>

    <div class="mt-3 grid grid-cols-2 gap-3">
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
import ImageField from './fields/ImageField.vue'
import SegmentedField from './fields/SegmentedField.vue'
import ToggleField from './fields/ToggleField.vue'
import ColorField from './fields/ColorField.vue'
import SliderField from './fields/SliderField.vue'

const props = withDefaults(
  defineProps<{ block: SiteBlock; brandColors?: { label: string; value: string }[]; brandColor?: string | null }>(),
  { brandColors: () => [], brandColor: null },
)

const DEVICES = [
  { key: 'desktop' as const, label: 'Escritorio' },
  { key: 'tablet' as const, label: 'Tablet' },
  { key: 'mobile' as const, label: 'Móvil' },
]

// «Color corporativo» (Cola 27): no guarda un HEX, guarda el token `brand`; el
// render lo resuelve en vivo contra el Brand Kit. El swatch muestra el color
// de marca actual si se conoce, o un gris si aún no hay color de marca.
const backgroundOptions = computed(() => [
  { value: '', label: 'Automático (del bloque)', swatchClass: 'bg-white bg-[linear-gradient(45deg,#e7e4de_25%,transparent_25%,transparent_75%,#e7e4de_75%),linear-gradient(45deg,#e7e4de_25%,transparent_25%,transparent_75%,#e7e4de_75%)] bg-[length:8px_8px] bg-[position:0_0,4px_4px]' },
  { value: 'paper', label: 'Papel', swatchClass: 'bg-paper' },
  { value: 'white', label: 'Blanco', swatchClass: 'bg-white' },
  { value: 'surface', label: 'Superficie', swatchClass: 'bg-surface' },
  { value: 'ink', label: 'Oscuro', swatchClass: 'bg-ink' },
  { value: 'brand', label: 'Color corporativo (Brand Kit)', swatchClass: props.brandColor ? '' : 'bg-stone-300', swatchStyle: props.brandColor ? { backgroundColor: props.brandColor } : undefined },
])
const SPACING_OPTIONS = [
  { value: '', label: 'Ninguno' },
  { value: 'sm', label: 'Pequeño' },
  { value: 'lg', label: 'Grande' },
]
const POSITION_OPTIONS = [
  { value: 'center', label: 'Centro' },
  { value: 'top', label: 'Arriba' },
  { value: 'bottom', label: 'Abajo' },
  { value: 'left', label: 'Izquierda' },
  { value: 'right', label: 'Derecha' },
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
function setRepeat(on: boolean) {
  if (!props.block.style) props.block.style = {}
  if (on) props.block.style.backgroundRepeat = true
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  else delete props.block.style.backgroundRepeat
}
function setOverlayColor(v: string | undefined) {
  setStyle('overlayColor', v || '')
  // Al poner color de superposición por primera vez, una opacidad por defecto visible.
  if (v && !props.block.style?.overlayOpacity) props.block.style!.overlayOpacity = 40
}
function setOverlayOpacity(v: number) {
  if (!props.block.style) props.block.style = {}
  props.block.style.overlayOpacity = v
}

const anchorId = computed(() => props.block.style?.anchorId || '')
const background = computed(() => props.block.style?.background || '')
const paddingTop = computed(() => props.block.style?.paddingTop || '')
const paddingBottom = computed(() => props.block.style?.paddingBottom || '')
const backgroundImage = computed(() => props.block.style?.backgroundImage || '')
const backgroundSize = computed(() => props.block.style?.backgroundSize || 'cover')
const backgroundPosition = computed(() => props.block.style?.backgroundPosition || 'center')
const backgroundRepeat = computed(() => props.block.style?.backgroundRepeat === true)
const overlayColor = computed(() => props.block.style?.overlayColor || '')
const overlayOpacity = computed(() => Number(props.block.style?.overlayOpacity ?? 40))

function isVisible(d: 'desktop' | 'tablet' | 'mobile') {
  return props.block.visibility?.[d] !== false
}
function setVisible(d: 'desktop' | 'tablet' | 'mobile', visible: boolean) {
  props.block.visibility = { ...props.block.visibility, [d]: visible }
}
</script>
