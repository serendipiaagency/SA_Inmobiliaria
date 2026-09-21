<template>
  <div data-testid="node-inspector">
    <!-- ------------------------------------------------------------ Contenido -->
    <InspectorSection v-if="node.dynamic" title="Contenido dinámico">
      <div class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-900" data-testid="node-dynamic-notice">
        <p class="font-semibold">Este contenido procede de {{ sourceName }}.</p>
        <p class="mt-1 text-amber-800">Fuente: {{ node.dynamic }}. Aquí sólo se cambia cómo se ve; el dato se administra en su ficha.</p>
        <NuxtLink v-if="node.sourceHref" :to="node.sourceHref" target="_blank" class="mt-2 inline-block font-semibold underline">Editar en {{ sourceName }} →</NuxtLink>
      </div>
    </InspectorSection>

    <InspectorSection v-else-if="hasContent" title="Contenido">
      <TextField
        v-if="kindHas(node.kind, 'text')"
        :label="node.label"
        :multiline="node.multiline || node.kind === 'text' || node.kind === 'caption'"
        :model-value="String(content[node.field] ?? '')"
        data-testid="node-text"
        @update:model-value="setContent(node.field, $event)"
      />
      <LinkField v-if="kindHas(node.kind, 'link') && node.linkField" label="Enlace" :model-value="String(content[node.linkField] ?? '')" test-id="node-link" @update:model-value="setContent(node.linkField!, $event)" />
      <template v-if="kindHas(node.kind, 'media')">
        <ImageField label="Imagen" folder="site-builder" aspect="video" :model-value="String(content[node.field] ?? '')" @update:model-value="setContent(node.field, $event)" />
        <TextField v-if="node.altField" label="Texto alternativo" :model-value="String(content[node.altField] ?? '')" placeholder="Describe la imagen…" @update:model-value="setContent(node.altField!, $event)" />
      </template>
    </InspectorSection>

    <!-- --------------------------------------------------------------- Diseño -->
    <InspectorSection title="Dispositivo" tab="design">
      <div class="rounded-lg bg-stone-100 px-3 py-2 text-[12px] text-stone-600" data-testid="node-device-banner">
        <p>
          Editando la vista <strong>{{ DEVICE_LABEL[device] }}</strong>.
          <span v-if="device !== 'desktop'">Lo que no definas aquí se hereda de {{ device === 'mobile' ? 'Tablet y Escritorio' : 'Escritorio' }}.</span>
          <span v-else>Tablet y Móvil heredan estos valores salvo que tengan los suyos.</span>
        </p>
        <p v-if="ownCount" class="mt-1 text-blue-700">
          {{ ownCount }} propiedad{{ ownCount === 1 ? '' : 'es' }} con valor propio en {{ DEVICE_LABEL[device] }} ·
          <button type="button" class="font-semibold underline" @click="clearDevice">quitar</button>
        </p>
      </div>
    </InspectorSection>

    <InspectorSection v-if="kindHas(node.kind, 'typography')" title="Tipografía" tab="design">
      <FontFamilyField label="Fuente" :model-value="own.fontFamily" :inherited="inheritedFont" :brand-fonts="brandFonts" :overridden="isOwn('fontFamily')" @update:model-value="setProp('fontFamily', $event)" />
      <NumberField label="Tamaño" :model-value="own.fontSize" :inherited="effective.fontSize" :min="8" :max="200" :overridden="isOwn('fontSize')" test-id="node-font-size" @update:model-value="setProp('fontSize', $event)" />
      <SelectField label="Peso" :model-value="own.fontWeight !== undefined ? String(own.fontWeight) : ''" :options="weightOptions" @update:model-value="setProp('fontWeight', $event ? Number($event) : undefined)" />
      <div class="grid grid-cols-2 gap-3">
        <SelectField label="Estilo" :model-value="own.fontStyle || ''" :options="[{ value: '', label: 'Heredado' }, { value: 'normal', label: 'Normal' }, { value: 'italic', label: 'Cursiva' }]" @update:model-value="setProp('fontStyle', $event || undefined)" />
        <SelectField label="Mayúsculas" :model-value="own.textTransform || ''" :options="[{ value: '', label: 'Heredado' }, { value: 'none', label: 'Como se escribe' }, { value: 'uppercase', label: 'MAYÚSCULAS' }, { value: 'capitalize', label: 'Cada Palabra' }]" @update:model-value="setProp('textTransform', $event || undefined)" />
      </div>
      <SelectField label="Subrayado" :model-value="own.textDecoration || ''" :options="[{ value: '', label: 'Heredado' }, { value: 'none', label: 'Sin subrayar' }, { value: 'underline', label: 'Subrayado' }]" @update:model-value="setProp('textDecoration', $event || undefined)" />
      <NumberField label="Interlineado" :model-value="own.lineHeight" :inherited="effective.lineHeight" :min="0.8" :max="3" :step="0.05" unit="×" :overridden="isOwn('lineHeight')" @update:model-value="setProp('lineHeight', $event)" />
      <NumberField label="Espaciado entre letras" :model-value="own.letterSpacing" :inherited="effective.letterSpacing" :min="-0.1" :max="1" :step="0.01" unit="em" :overridden="isOwn('letterSpacing')" @update:model-value="setProp('letterSpacing', $event)" />
    </InspectorSection>

    <InspectorSection v-if="kindHas(node.kind, 'color') || kindHas(node.kind, 'background') || kindHas(node.kind, 'border')" title="Color" tab="design">
      <ColorField v-if="kindHas(node.kind, 'color')" label="Color del texto" :model-value="own.color" :inherited="effective.color" :brand-colors="brandColors" :overridden="isOwn('color')" test-id="node-color" @update:model-value="setProp('color', $event)" />
      <ColorField v-if="kindHas(node.kind, 'background')" label="Fondo" :model-value="own.background" :inherited="effective.background" :brand-colors="brandColors" :overridden="isOwn('background')" test-id="node-background" @update:model-value="setProp('background', $event)" />
      <template v-if="kindHas(node.kind, 'border')">
        <ColorField label="Borde" :model-value="own.borderColor" :inherited="effective.borderColor" :brand-colors="brandColors" :overridden="isOwn('borderColor')" @update:model-value="setProp('borderColor', $event)" />
        <NumberField label="Grosor del borde" :model-value="own.borderWidth" :inherited="effective.borderWidth" :min="0" :max="12" :overridden="isOwn('borderWidth')" @update:model-value="setProp('borderWidth', $event)" />
      </template>
    </InspectorSection>

    <InspectorSection v-if="kindHas(node.kind, 'align') || kindHas(node.kind, 'spacing') || kindHas(node.kind, 'radius')" title="Disposición" tab="design">
      <SegmentedField
        v-if="kindHas(node.kind, 'align')"
        label="Alineación"
        :model-value="own.align || ''"
        :options="[{ value: '', label: 'Heredada' }, { value: 'left', label: 'Izq.' }, { value: 'center', label: 'Centro' }, { value: 'right', label: 'Der.' }]"
        @update:model-value="setProp('align', $event || undefined)"
      />
      <template v-if="kindHas(node.kind, 'spacing')">
        <div class="grid grid-cols-2 gap-3">
          <NumberField label="Margen arriba" :model-value="own.marginTop" :inherited="effective.marginTop" :min="0" :max="240" :step="4" :overridden="isOwn('marginTop')" @update:model-value="setProp('marginTop', $event)" />
          <NumberField label="Margen abajo" :model-value="own.marginBottom" :inherited="effective.marginBottom" :min="0" :max="240" :step="4" :overridden="isOwn('marginBottom')" @update:model-value="setProp('marginBottom', $event)" />
        </div>
        <div v-if="node.kind === 'button' || node.kind === 'card' || node.kind === 'box' || node.kind === 'eyebrow'" class="grid grid-cols-2 gap-3">
          <NumberField label="Relleno horizontal" :model-value="own.paddingX" :inherited="effective.paddingX" :min="0" :max="120" :step="2" :overridden="isOwn('paddingX')" @update:model-value="setProp('paddingX', $event)" />
          <NumberField label="Relleno vertical" :model-value="own.paddingY" :inherited="effective.paddingY" :min="0" :max="120" :step="2" :overridden="isOwn('paddingY')" @update:model-value="setProp('paddingY', $event)" />
        </div>
      </template>
      <NumberField v-if="kindHas(node.kind, 'radius')" label="Radio de las esquinas" :model-value="own.radius" :inherited="effective.radius" :min="0" :max="200" :overridden="isOwn('radius')" @update:model-value="setProp('radius', $event)" />
    </InspectorSection>

    <InspectorSection v-if="kindHas(node.kind, 'imageFit') || kindHas(node.kind, 'opacity')" title="Imagen" tab="design">
      <template v-if="kindHas(node.kind, 'imageFit')">
        <SegmentedField label="Ajuste" :model-value="own.objectFit || ''" :options="[{ value: '', label: 'Heredado' }, { value: 'cover', label: 'Rellenar' }, { value: 'contain', label: 'Encajar' }]" @update:model-value="setProp('objectFit', $event || undefined)" />
        <SelectField label="Punto focal" :model-value="own.objectPosition || ''" :options="FOCAL_OPTIONS" @update:model-value="setProp('objectPosition', $event || undefined)" />
      </template>
      <NumberField v-if="kindHas(node.kind, 'opacity')" label="Opacidad" :model-value="own.opacity" :inherited="effective.opacity" :min="0" :max="100" unit="%" :overridden="isOwn('opacity')" @update:model-value="setProp('opacity', $event)" />
    </InspectorSection>

    <InspectorSection v-if="hasAnyOverride" title="Restablecer" tab="design">
      <button type="button" class="btn-quiet w-full !py-2 !text-[11px]" data-testid="node-reset-all" @click="resetAll">Restablecer todos los estilos de este elemento</button>
      <p class="mt-1.5 text-[11px] text-stone-400">Vuelve al estilo global de la página en todos los dispositivos. Se puede deshacer.</p>
    </InspectorSection>
  </div>
</template>

<script setup lang="ts">
import type { SiteBlock, SitePageDocument } from '~/server/utils/sitePages'
import {
  OBJECT_POSITIONS,
  kindHas,
  hasNodeOverrides,
  ownNodeProps,
  resolveNodeProps,
  withNodeProp,
  type Device,
  type NodeStyleProps,
} from '~/utils/siteBuilder/nodes'
import { fontDef } from '~/utils/siteBuilder/fonts'
import type { SiteNodeRef } from '~/composables/useSiteEditor'
import InspectorSection from './InspectorSection.vue'
import TextField from './fields/TextField.vue'
import SelectField from './fields/SelectField.vue'
import SegmentedField from './fields/SegmentedField.vue'
import ImageField from './fields/ImageField.vue'
import FontFamilyField from './fields/FontFamilyField.vue'
import ColorField from './fields/ColorField.vue'
import NumberField from './fields/NumberField.vue'
import LinkField from './fields/LinkField.vue'

/**
 * El inspector de un nodo (un título, un botón, una imagen…) — se construye
 * a partir de las capacidades de su tipo (utils/siteBuilder/nodes.ts), no
 * de un `switch` por bloque: un título tiene tipografía, color, alineación
 * y espaciado; una imagen, ajuste y radio; un botón, además enlace y fondo.
 * Lo que no tiene sentido para el elemento no aparece.
 *
 * Escribe en `block.content` (texto, enlace, imagen) y en
 * `block.nodeStyles[campo]` (presentación), siempre a través de
 * `withNodeProp`, que sanea igual que el servidor; y siempre para el
 * dispositivo que el lienzo está mostrando: con Tablet seleccionado, un
 * tamaño de letra es un override de tablet. Un nodo dinámico no expone su
 * contenido — sólo dice de dónde viene y cómo cambiarlo.
 */
const props = defineProps<{
  block: SiteBlock
  node: SiteNodeRef
  device: Device
  globalStyles: SitePageDocument['styles'] | null | undefined
  brandColors: { label: string; value: string }[]
  brandFonts: string[]
}>()

const beginEdit = inject<() => void>('sbBeginEdit', () => {})

const DEVICE_LABEL: Record<Device, string> = { desktop: 'Escritorio', tablet: 'Tablet', mobile: 'Móvil' }
const FOCAL_OPTIONS = [
  { value: '', label: 'Heredado' },
  ...OBJECT_POSITIONS.map((p) => ({ value: p, label: { '50% 50%': 'Centro', '50% 0%': 'Arriba', '50% 100%': 'Abajo', '0% 50%': 'Izquierda', '100% 50%': 'Derecha' }[p] || p })),
]

const content = computed(() => props.block.content)
const hasContent = computed(() => kindHas(props.node.kind, 'text') || kindHas(props.node.kind, 'link') || kindHas(props.node.kind, 'media'))
const sourceName = computed(() => (props.node.dynamic || '').split('→')[0].trim() || 'su origen')

const style = computed(() => props.block.nodeStyles?.[props.node.field])
const own = computed(() => ownNodeProps(style.value, props.device))
const effective = computed(() => resolveNodeProps(style.value, props.device))
const ownCount = computed(() => Object.keys(own.value).length)
const hasAnyOverride = computed(() => hasNodeOverrides(style.value))

function isOwn(key: keyof NodeStyleProps): boolean {
  return own.value[key] !== undefined
}

const inheritedFont = computed(() => {
  if (effective.value.fontFamily && own.value.fontFamily === undefined) return effective.value.fontFamily
  const isHeading = props.node.kind === 'heading'
  return (isHeading ? props.globalStyles?.fontHeading : props.globalStyles?.fontBody) || 'Inter'
})
const weightOptions = computed(() => {
  const family = own.value.fontFamily || effective.value.fontFamily || inheritedFont.value
  const weights = fontDef(family)?.weights || [300, 400, 500, 600, 700, 800]
  const names: Record<number, string> = { 300: 'Fina', 400: 'Normal', 500: 'Media', 600: 'Seminegrita', 700: 'Negrita', 800: 'Extranegrita' }
  return [{ value: '', label: 'Heredado' }, ...weights.map((w) => ({ value: String(w), label: `${w} · ${names[w] || ''}`.trim() }))]
})

function setContent(field: string, value: string) {
  beginEdit()
  props.block.content[field] = value
}

function setProp(key: keyof NodeStyleProps, value: unknown) {
  beginEdit()
  const next = withNodeProp(style.value, props.device, key, value)
  writeStyle(next)
}
function writeStyle(next: ReturnType<typeof withNodeProp>) {
  if (next) {
    if (!props.block.nodeStyles) props.block.nodeStyles = {}
    props.block.nodeStyles[props.node.field] = next
    return
  }
  if (!props.block.nodeStyles) return
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete props.block.nodeStyles[props.node.field]
  if (!Object.keys(props.block.nodeStyles).length) delete props.block.nodeStyles
}
function clearDevice() {
  beginEdit()
  let next = style.value
  for (const key of Object.keys(own.value) as (keyof NodeStyleProps)[]) next = withNodeProp(next, props.device, key, undefined)
  writeStyle(next)
}
function resetAll() {
  beginEdit()
  writeStyle(undefined)
}
</script>
