<template>
  <div>
    <InspectorSection title="Contenido">
      <TextField label="Eyebrow" :model-value="content.eyebrow || ''" @update:model-value="(v) => (content.eyebrow = v)" />
      <TextField label="Título (línea 1)" :model-value="content.title1 || ''" @update:model-value="(v) => (content.title1 = v)" />
      <TextField label="Título (línea 2, cursiva)" :model-value="content.title2 || ''" @update:model-value="(v) => (content.title2 = v)" />
      <TextField label="Subtítulo" multiline :model-value="content.subtitle || ''" @update:model-value="(v) => (content.subtitle = v)" />

    </InspectorSection>

    <!-- Buscador: sólo presentación. Qué se encuentra lo decide Property Search. -->
    <InspectorSection title="Buscador">
      <p class="mb-2 text-[12px] leading-relaxed text-stone-500">Campos de la barra, en su orden. Baños, superficie, estado y características van en «Más filtros».</p>
      <ul class="mb-3 space-y-1" data-testid="hero-fields">
        <li v-for="(f, i) in search.fieldList" :key="f.key" class="flex items-center gap-2 rounded-lg border border-line bg-white px-2.5 py-1.5" :class="{ 'opacity-60': !f.visible }" :data-field="f.key">
          <input type="checkbox" class="h-4 w-4 shrink-0 accent-ink" :checked="f.visible" :aria-label="`Mostrar «${FIELD_LABELS[f.key]}»`" data-testid="hero-field-toggle" @change="toggleField(i)" >
          <span class="min-w-0 flex-1 truncate text-[12.5px]" :class="f.visible ? 'text-ink' : 'text-stone-400 line-through'">{{ FIELD_LABELS[f.key] }}</span>
          <button type="button" class="hf-move" :disabled="i === 0" :aria-label="`Subir «${FIELD_LABELS[f.key]}»`" data-testid="hero-field-up" @click="moveField(i, -1)">↑</button>
          <button type="button" class="hf-move" :disabled="i === search.fieldList.length - 1" :aria-label="`Bajar «${FIELD_LABELS[f.key]}»`" data-testid="hero-field-down" @click="moveField(i, 1)">↓</button>
        </li>
      </ul>
      <TextField label="Texto del botón" :model-value="content.searchButtonLabel || ''" placeholder="Buscar" data-testid="hero-button-label" @update:model-value="(v) => (content.searchButtonLabel = v)" />
      <ToggleField label="Enlace «Más filtros»" :model-value="search.showMoreFilters" data-testid="hero-show-more" @update:model-value="(v) => (content.showMoreFilters = v)" />
      <SegmentedField
        label="Operación de partida"
        :model-value="search.defaultOperation"
        :options="[{ value: 'venta', label: 'Comprar' }, { value: 'alquiler', label: 'Alquilar' }]"
        data-testid="hero-default-operation"
        @update:model-value="(v) => (content.defaultOperation = v)"
      />
      <p class="mt-1 text-[11px] leading-relaxed text-stone-400">Al pulsar «Buscar» se abre Propiedades con todo lo elegido, y su panel lo enseña marcado. Quien vuelve de una búsqueda la encuentra tal cual.</p>
    </InspectorSection>

    <InspectorSection title="Multimedia">
      <SegmentedField
        label="Fondo"
        :model-value="backgroundMode"
        :options="[{ value: 'slideshow', label: 'Bucle de imágenes' }, { value: 'static', label: 'Imagen fija' }]"
        data-testid="hero-background-mode"
        @update:model-value="(v) => (content.backgroundMode = v)"
      />
      <GalleryField
        v-if="backgroundMode === 'slideshow'"
        label="Imágenes de fondo"
        :hint="`Se alternan en bucle, una cada ${HERO_SLIDE_SECONDS} segundos. La primera es la portada inicial. Con una sola imagen, el fondo queda fijo.`"
        folder="site-builder"
        :model-value="slides"
        @update:model-value="(v) => (content.slides = v)"
      />
      <template v-else>
        <ImageField label="Imagen de fondo" folder="site-builder" aspect="wide" :model-value="content.backgroundImage || ''" @update:model-value="(v) => (content.backgroundImage = v)" />
        <p class="-mt-1 mb-3 text-[11px] text-stone-400" data-testid="hero-static-hint">
          {{ content.backgroundImage ? 'Se queda quieta, sin bucle ni zoom.' : 'Sin imagen elegida se usa la primera del bucle.' }} Las imágenes del bucle se conservan por si vuelves a él.
        </p>
      </template>
    </InspectorSection>

    <InspectorSection title="Diseño" tab="design">
      <SliderField label="Opacidad del overlay" :model-value="content.overlayOpacity || 0" @update:model-value="(v) => (content.overlayOpacity = v)" />
      <SelectField label="Posición del fondo (focal point)" :model-value="content.backgroundPosition || '50% 50%'" :options="FOCAL_POINTS" @update:model-value="(v) => (content.backgroundPosition = v)" />
      <SegmentedField
        label="Alineación del contenido"
        :model-value="content.contentAlign || 'left'"
        :options="[{ value: 'left', label: 'Izquierda' }, { value: 'center', label: 'Centrado' }]"
        @update:model-value="(v) => (content.contentAlign = v)"
      />
    </InspectorSection>

    <InspectorSection title="Buscador — diseño" tab="design">
      <ColorField label="Color del botón «Buscar» y de Comprar/Alquilar" :model-value="content.searchButtonColor || undefined" test-id="hero-button-color" @update:model-value="(v) => (content.searchButtonColor = v && /^#[0-9a-f]{6}$/i.test(v) ? v : undefined)" />
      <p class="-mt-1 mb-3 text-[11px] leading-relaxed text-stone-400">Sin color propio, el de tu marca (Configuración → empresa). Si es muy claro se oscurece lo justo para que el texto blanco se lea.</p>
      <SegmentedField
        label="Esquinas de la barra"
        :model-value="search.radius"
        :options="[{ value: 'md', label: 'Suaves' }, { value: 'lg', label: 'Redondeadas' }, { value: 'pill', label: 'Píldora' }]"
        data-testid="hero-search-radius"
        @update:model-value="(v) => (content.searchRadius = v)"
      />
    </InspectorSection>
  </div>
</template>

<script setup lang="ts">
import InspectorSection from '../inspector/InspectorSection.vue'
import TextField from '../inspector/fields/TextField.vue'
import GalleryField from '../inspector/fields/GalleryField.vue'
import ImageField from '../inspector/fields/ImageField.vue'
import { HERO_SLIDE_SECONDS, heroBackgroundMode } from '~/utils/siteBuilder/heroMedia'
import SliderField from '../inspector/fields/SliderField.vue'
import SelectField from '../inspector/fields/SelectField.vue'
import SegmentedField from '../inspector/fields/SegmentedField.vue'
import ToggleField from '../inspector/fields/ToggleField.vue'
import ColorField from '../inspector/fields/ColorField.vue'
import { HERO_SEARCH_FIELDS, heroSearchOptions, normalizeHeroFields } from '~/utils/heroSearch'

const props = defineProps<{ content: Record<string, any> }>()
const slides = computed<string[]>(() => (Array.isArray(props.content.slides) ? props.content.slides : []))
const backgroundMode = computed(() => heroBackgroundMode(props.content.backgroundMode))

// Buscador (utils/heroSearch.ts): se guarda la lista entera de campos, en orden.
const search = computed(() => heroSearchOptions(props.content))
const FIELD_LABELS = Object.fromEntries(HERO_SEARCH_FIELDS.map((f) => [f.key, f.label])) as Record<string, string>
function toggleField(i: number) {
  const next = normalizeHeroFields(props.content.searchFields)
  next[i] = { ...next[i]!, visible: !next[i]!.visible }
  props.content.searchFields = next
}
function moveField(i: number, dir: -1 | 1) {
  const next = normalizeHeroFields(props.content.searchFields)
  const j = i + dir
  if (j < 0 || j >= next.length) return
  ;[next[i], next[j]] = [next[j]!, next[i]!]
  props.content.searchFields = next
}

const FOCAL_POINTS = [
  { value: '50% 0%', label: 'Arriba' },
  { value: '50% 50%', label: 'Centro' },
  { value: '50% 100%', label: 'Abajo' },
  { value: '0% 50%', label: 'Izquierda' },
  { value: '100% 50%', label: 'Derecha' },
]
</script>

<style scoped>
.hf-move {
  display: inline-flex;
  height: 24px;
  width: 24px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  font-size: 13px;
  color: #57534e;
}
.hf-move:hover:not(:disabled) {
  background: #f1eee8;
  color: #1c1b19;
}
.hf-move:disabled {
  opacity: 0.3;
}
</style>
