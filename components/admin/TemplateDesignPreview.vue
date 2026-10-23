<template>
  <div class="template-preview shrink-0" :style="{ width: `${width}px` }" aria-hidden="true">
    <div
      class="relative mx-auto overflow-hidden rounded-md border border-line bg-white shadow-sm"
      :style="{ width: `${boxW}px`, height: `${boxH}px` }"
    >
      <template v-if="elements.length">
        <!-- Cada elemento de la primera página, a escala, con los datos de la
             propiedad de demostración (foto, título, precio, colores de marca…),
             igual que se verá el documento real. -->
        <div
          v-for="(el, i) in elements"
          :key="el.id || i"
          class="absolute overflow-hidden"
          :style="boxStyle(el)"
        >
          <img
            v-if="el.type === 'image' && imgUrlFrom(el, bindings)"
            :src="imgUrlFrom(el, bindings)!"
            class="h-full w-full object-cover"
            alt=""
            loading="lazy"
          >
          <div v-else-if="el.type === 'image'" class="flex h-full w-full items-center justify-center bg-stone-100 text-[8px] text-stone-300">▣</div>
          <div v-else-if="el.type === 'qr'" class="flex h-full w-full items-center justify-center bg-stone-800 text-[8px] text-white">▦</div>
          <div
            v-else-if="el.type === 'text'"
            class="flex h-full w-full items-start"
            :style="textCssFrom(el, scale, bindings)"
          >{{ textContentFrom(el, bindings) }}</div>
          <!-- Las formas no se dibujan (el PDF tampoco las dibuja todavía). -->
        </div>
      </template>
      <div v-else class="flex h-full w-full items-center justify-center text-[9px] text-stone-300">Sin diseño</div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Miniatura del diseño de una plantilla (Asset Export o cartel), renderizada a
 * partir de su estructura (`{ pages: [{ elements }] }`) CON una propiedad de
 * demostración: foto real, título, precio, ubicación y colores de marca, para
 * que la galería de «Plantillas» enseñe cómo quedará el documento en vez de una
 * maqueta esquemática. No es el PDF final (ese lo genera el servidor con una
 * propiedad real), pero usa los mismos resolvedores que el lienzo del editor
 * (utils/assetExport/clientRender.ts), así que corresponde al resultado.
 *
 * La propiedad de demostración vive sólo en el cliente (utils/assetExport/
 * demoProperty.ts) y NUNCA se usa en una exportación real ni se crea en Property
 * Core: separación estricta demo/producción.
 */
import { DEMO_BINDINGS } from '~/utils/assetExport/demoProperty'
import { firstPageElements, imgUrlFrom, textContentFrom, textCssFrom, type RenderElement } from '~/utils/assetExport/clientRender'

// Duplicado de server/utils/assetExport/formats.ts (el bundle de cliente no
// importa server/) — mantener en sync si cambian formatos.
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
  defineProps<{ structure: unknown; formatKey: string; width?: number }>(),
  { width: 120 },
)

// La galería siempre previsualiza con la propiedad de demostración (no hay una
// propiedad real seleccionada al listar las plantillas).
const bindings = DEMO_BINDINGS

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

const elements = computed<RenderElement[]>(() => firstPageElements(props.structure))

function boxStyle(el: RenderElement) {
  return {
    left: `${el.x * scale.value}px`,
    top: `${el.y * scale.value}px`,
    width: `${Math.max(2, el.w * scale.value)}px`,
    height: `${Math.max(2, el.h * scale.value)}px`,
  }
}
</script>
