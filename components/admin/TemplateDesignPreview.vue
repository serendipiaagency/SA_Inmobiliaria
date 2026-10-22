<template>
  <div class="template-preview shrink-0" :style="{ width: `${width}px` }" aria-hidden="true">
    <div
      class="relative mx-auto overflow-hidden rounded-md border border-line bg-white shadow-sm"
      :style="{ width: `${boxW}px`, height: `${boxH}px` }"
    >
      <template v-if="elements.length">
        <div
          v-for="el in elements"
          :key="el.id"
          class="absolute flex items-center justify-center overflow-hidden rounded-[2px]"
          :class="blockClass(el.type)"
          :style="elementStyle(el)"
        >
          <span v-if="el.type === 'image'" class="text-[8px] leading-none">▣</span>
          <span v-else-if="el.type === 'qr'" class="text-[8px] leading-none">▦</span>
          <span v-else-if="el.type === 'shape'" />
          <span v-else class="w-full truncate px-0.5 text-center text-[6px] leading-none text-stone-600">{{ label(el) }}</span>
        </div>
      </template>
      <div v-else class="flex h-full w-full items-center justify-center text-[9px] text-stone-300">Sin diseño</div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Miniatura esquemática del diseño de una plantilla (Asset Export o cartel),
 * renderizada a partir de su estructura (`{ pages: [{ elements }] }`). No es un
 * render real del PDF —ese necesita una propiedad y el pipeline del servidor—,
 * sino una vista a escala de la MAQUETA: dónde van la foto, los textos y el QR
 * de la primera página. Es determinista, ligera y sirve igual para los dos
 * tipos de plantilla porque ambas comparten el mismo esquema de estructura y el
 * mismo editor de lienzo (`AssetExportCanvasEditor`).
 */
interface TemplateElement {
  id: string
  type: 'text' | 'image' | 'qr' | 'shape'
  x: number
  y: number
  w: number
  h: number
  binding?: string
}
interface TemplateStructure {
  pages?: Array<{ id: string; elements?: TemplateElement[] }>
}

// Duplicado de server/utils/assetExport/formats.ts y del editor de lienzo (el
// bundle de cliente no importa server/) — mantener en sync si cambian formatos.
const FORMATS: Record<string, { widthPt: number; heightPt: number }> = {
  pdf_a4_portrait: { widthPt: 595, heightPt: 842 },
  pdf_a4_landscape: { widthPt: 842, heightPt: 595 },
  pdf_a5_portrait: { widthPt: 420, heightPt: 595 },
  pdf_dossier: { widthPt: 595, heightPt: 842 },
  print_a3_portrait: { widthPt: 842, heightPt: 1191 },
  print_a3_landscape: { widthPt: 1191, heightPt: 842 },
  print_a4_portrait: { widthPt: 595, heightPt: 842 },
  print_a4_landscape: { widthPt: 842, heightPt: 595 },
  social_feed_square: { widthPt: 1080, heightPt: 1080 },
  social_feed_portrait: { widthPt: 1080, heightPt: 1350 },
  social_story: { widthPt: 1080, heightPt: 1920 },
}

const props = withDefaults(
  defineProps<{ structure: TemplateStructure | string | null | undefined; formatKey: string; width?: number }>(),
  { width: 120 },
)

const parsed = computed<TemplateStructure>(() => {
  const s = props.structure
  if (!s) return { pages: [] }
  if (typeof s === 'string') {
    try {
      return JSON.parse(s) as TemplateStructure
    } catch {
      return { pages: [] }
    }
  }
  return s
})

const format = computed(() => FORMATS[props.formatKey] || FORMATS.pdf_a4_portrait)
// La miniatura respeta la proporción real del formato, acotando la altura para
// que un A3/story muy alto no rompa la fila de la tabla.
const MAX_H = 170
const scale = computed(() => {
  const byWidth = props.width / format.value.widthPt
  const byHeight = MAX_H / format.value.heightPt
  return Math.min(byWidth, byHeight)
})
const boxW = computed(() => Math.round(format.value.widthPt * scale.value))
const boxH = computed(() => Math.round(format.value.heightPt * scale.value))

const elements = computed<TemplateElement[]>(() => parsed.value.pages?.[0]?.elements ?? [])

function elementStyle(el: TemplateElement) {
  return {
    left: `${el.x * scale.value}px`,
    top: `${el.y * scale.value}px`,
    width: `${Math.max(2, el.w * scale.value)}px`,
    height: `${Math.max(2, el.h * scale.value)}px`,
  }
}

function blockClass(type: string) {
  if (type === 'image') return 'bg-stone-200 text-stone-400'
  if (type === 'qr') return 'bg-stone-800 text-white'
  if (type === 'shape') return 'bg-stone-100'
  return 'bg-stone-50'
}

const TOKEN_LABELS: Record<string, string> = {
  'asset.title': 'Título',
  'asset.price': 'Precio',
  'asset.location': 'Ubicación',
  'asset.description': 'Descripción',
  'asset.reference': 'Ref.',
  'asset.propertyType': 'Tipo',
  'tenant.phone': 'Teléfono',
  'tenant.website': 'Web',
  'tenant.legalText': 'Legal',
}
function label(el: TemplateElement) {
  const b = (el.binding || '').trim()
  if (!b) return 'Texto'
  const token = b.replace(/^\{\{\s*|\s*\}\}$/g, '')
  return TOKEN_LABELS[token] || token.replace(/^asset\.|^tenant\./, '') || b
}
</script>
