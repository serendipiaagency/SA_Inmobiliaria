<template>
  <div data-testid="page-core-inspector">
    <InspectorSection title="Zona dinámica">
      <p class="text-sm leading-relaxed text-stone-600">
        <strong class="text-ink">{{ label }}.</strong>
        Esta parte de la página se rellena sola con tus datos, así que no tiene textos que escribir aquí.
      </p>
      <p class="mt-3 text-sm leading-relaxed text-stone-600">
        Puedes añadir secciones encima o debajo y moverla con las flechas. No se puede borrar, duplicar ni ocultar: sin ella la página dejaría de funcionar.
      </p>
      <NuxtLink v-if="source" :to="source.to" target="_blank" class="btn-quiet mt-4 inline-flex !text-[12px]">
        Gestionar en {{ source.label }} ↗
      </NuxtLink>
    </InspectorSection>
    <!-- Ficha: lo único ajustable de la zona; los datos siguen saliendo de cada propiedad -->
    <InspectorSection v-if="content.core === 'property-detail'" title="Propiedades destacadas">
      <p class="mb-3 text-[12px] leading-relaxed text-stone-500">
        Debajo de «Propiedades similares», las que marcas como <strong>Exclusiva</strong> en Propiedades (web), sin repetir la que se está viendo ni las similares. Si no hay ninguna, la sección no aparece.
      </p>
      <ToggleField label="Mostrar en la ficha" :model-value="content.showFeatured !== false" data-testid="page-core-show-featured" @update:model-value="(v) => (content.showFeatured = v)" />
      <TextField
        v-if="content.showFeatured !== false"
        label="Título"
        :model-value="content.featuredTitle || ''"
        placeholder="Propiedades destacadas"
        @update:model-value="(v) => (content.featuredTitle = v)"
      />
    </InspectorSection>
    <!-- Catálogo: qué partes del buscador se enseñan y con qué operación arranca.
         Sólo presentación: lo que se encuentra lo decide Property Search. -->
    <InspectorSection v-if="content.core === 'properties-listing'" title="Buscador del catálogo">
      <ToggleField label="Panel de filtros" :model-value="display.showPanel" data-testid="page-core-show-panel" @update:model-value="(v) => setDisplay('showPanel', v)" />
      <ToggleField label="Comprar | Alquilar en el panel" :model-value="display.showOperation" data-testid="page-core-show-operation" @update:model-value="(v) => setDisplay('showOperation', v)" />
      <SegmentedField
        label="Operación de partida"
        :model-value="display.defaultOperation"
        :options="[{ value: 'venta', label: 'Comprar' }, { value: 'alquiler', label: 'Alquilar' }]"
        data-testid="page-core-default-operation"
        @update:model-value="(v) => setDisplay('defaultOperation', v)"
      />
      <ToggleField label="«Ordenar por»" :model-value="display.showSort" data-testid="page-core-show-sort" @update:model-value="(v) => setDisplay('showSort', v)" />
      <ToggleField label="«Nueva búsqueda»" :model-value="display.showNewSearch" data-testid="page-core-show-new-search" @update:model-value="(v) => setDisplay('showNewSearch', v)" />
      <p class="mt-1 text-[11px] leading-relaxed text-stone-400">La operación de partida es la que se ve al entrar en Propiedades sin elegir otra, y a la que vuelve «Nueva búsqueda». Sin el panel, los filtros siguen aplicándose desde el buscador de la portada y sus etiquetas.</p>
    </InspectorSection>
    <!-- Ficha (#110): orden y visibilidad de sus secciones, para todas las fichas.
         Catálogo: orden, visibilidad y «abierto al cargar» de los grupos del panel de filtros. -->
    <InspectorSection v-if="list" :title="list.title">
      <p class="mb-3 text-[12px] leading-relaxed text-stone-500">{{ list.hint }}</p>
      <ul class="space-y-1" :data-testid="list.testid">
        <li v-for="(s, i) in items" :key="s.key" class="flex items-center gap-2 rounded-lg border border-line bg-white px-2.5 py-1.5" :class="{ 'opacity-60': !s.visible }" :data-section="s.key">
          <input type="checkbox" class="h-4 w-4 shrink-0 accent-ink" :checked="s.visible" :aria-label="`Mostrar «${s.label}»`" data-testid="page-core-section-toggle" @change="toggle(i)" >
          <span class="min-w-0 flex-1 truncate text-[12.5px]" :class="s.visible ? 'text-ink' : 'text-stone-400 line-through'">{{ s.label }}</span>
          <button
            v-if="list.field === 'filters'"
            type="button"
            class="rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold"
            :class="s.open ? 'bg-ink text-white' : 'text-stone-400 hover:text-ink'"
            :aria-pressed="!!s.open"
            :title="s.open ? 'Abierto al cargar' : 'Cerrado al cargar'"
            :disabled="!s.visible"
            data-testid="page-core-filter-open"
            @click="toggleOpen(i)"
          >
            {{ s.open ? 'Abierto' : 'Cerrado' }}
          </button>
          <button type="button" class="sec-move" :disabled="i === 0" :aria-label="`Subir «${s.label}»`" data-testid="page-core-section-up" @click="move(i, -1)">↑</button>
          <button type="button" class="sec-move" :disabled="i === items.length - 1" :aria-label="`Bajar «${s.label}»`" data-testid="page-core-section-down" @click="move(i, 1)">↓</button>
        </li>
      </ul>
      <p v-if="list.field === 'filters'" class="mt-2 text-[11px] leading-relaxed text-stone-400">«Abierto»: el grupo sale desplegado al cargar. Sin ninguno marcado, se abre Ubicación. Situación de la vivienda sólo sale si alguna propiedad la anuncia; Tipo de alquiler, sólo con «Alquilar».</p>
      <button v-if="content[list.field]" type="button" class="btn-quiet mt-3 !text-[12px]" :data-testid="`${list.testid}-reset`" @click="reset">Volver al orden de partida</button>
    </InspectorSection>
  </div>
</template>

<script setup lang="ts">
import InspectorSection from '../inspector/InspectorSection.vue'
import ToggleField from '../inspector/fields/ToggleField.vue'
import TextField from '../inspector/fields/TextField.vue'
import SegmentedField from '../inspector/fields/SegmentedField.vue'
import { CATALOG_FILTER_GROUPS, FICHA_SECTIONS, PAGE_CORE_LABELS, PAGE_CORE_SOURCES, catalogDisplayOptions, normalizeCatalogFilters, normalizeFichaSections, type FichaSectionSetting, type PageCoreKind } from '~/utils/siteBuilder/pages'

/**
 * Inspector de la zona dinámica de una página funcional (Propiedades, Ficha,
 * Blog — utils/siteBuilder/pages.ts). Explica qué es y dónde se gestiona lo
 * que enseña. Además, las opciones de PAGE_CORE_OPTIONS: en la ficha, si se
 * enseñan las propiedades destacadas y con qué título, y el orden y la
 * visibilidad de sus secciones (FICHA_SECTIONS); en el catálogo, los de los
 * grupos del panel de filtros (CATALOG_FILTER_GROUPS).
 */
const props = defineProps<{ content: Record<string, any> }>()
const label = computed(() => PAGE_CORE_LABELS[props.content.core as PageCoreKind] || 'Contenido de la página')
const source = computed(() => PAGE_CORE_SOURCES[props.content.core as PageCoreKind] || null)

// La lista ordenable de cada zona: qué opción guarda, de qué catálogo sale y cómo se explica.
const LISTS: Partial<Record<PageCoreKind, { field: 'sections' | 'filters'; catalog: { key: string; label: string }[]; normalize: (v: unknown) => FichaSectionSetting[]; title: string; hint: string; testid: string }>> = {
  'property-detail': {
    field: 'sections',
    catalog: FICHA_SECTIONS,
    normalize: normalizeFichaSections,
    title: 'Secciones de la ficha',
    hint: 'Ordena con las flechas y desmarca las que no quieras enseñar. Vale para todas las fichas. Una sección sin datos en una propiedad no aparece aunque esté marcada. La galería, la cabecera, el contacto y las similares se quedan en su sitio.',
    testid: 'page-core-sections',
  },
  'properties-listing': {
    field: 'filters',
    catalog: CATALOG_FILTER_GROUPS,
    normalize: normalizeCatalogFilters,
    title: 'Filtros del catálogo',
    hint: 'Los grupos del panel de filtros, en el orden en que salen. Ordena con las flechas y desmarca los que no quieras ofrecer. Vale en escritorio y en el móvil. «Más filtros» y el botón de resultados se quedan abajo.',
    testid: 'page-core-filters',
  },
}
const list = computed(() => LISTS[props.content.core as PageCoreKind] || null)
const items = computed(() => {
  const l = list.value
  if (!l) return []
  const labels = Object.fromEntries(l.catalog.map((x) => [x.key, x.label]))
  return l.normalize(props.content[l.field]).map((x) => ({ ...x, label: labels[x.key] }))
})
// Se guarda la lista entera, en orden: el lienzo y la web la leen igual.
function save(next: FichaSectionSetting[]) {
  if (list.value) props.content[list.value.field] = next.map(({ key, visible, open }) => ({ key, visible, ...(open ? { open: true } : {}) }))
}
function toggleOpen(i: number) {
  if (!list.value) return
  const next = list.value.normalize(props.content[list.value.field])
  next[i] = { ...next[i]!, open: !next[i]!.open }
  save(next)
}
// Opciones del buscador del catálogo: sólo se guarda lo que difiere de lo de partida.
const display = computed(() => catalogDisplayOptions(props.content))
function setDisplay(key: 'showPanel' | 'showOperation' | 'showSort' | 'showNewSearch' | 'defaultOperation', v: unknown) {
  props.content[key] = v
}
function toggle(i: number) {
  if (!list.value) return
  const next = list.value.normalize(props.content[list.value.field])
  next[i] = { ...next[i]!, visible: !next[i]!.visible }
  save(next)
}
function move(i: number, dir: -1 | 1) {
  if (!list.value) return
  const next = list.value.normalize(props.content[list.value.field])
  const j = i + dir
  if (j < 0 || j >= next.length) return
  ;[next[i], next[j]] = [next[j], next[i]]
  save(next)
}
function reset() {
  // Sin la opción, la zona vuelve al orden de partida (la web y el lienzo la completan solos).
  if (list.value?.field === 'sections') delete props.content.sections
  else if (list.value?.field === 'filters') delete props.content.filters
}
</script>

<style scoped>
.sec-move {
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
.sec-move:hover:not(:disabled) {
  background: #f1eee8;
  color: #1c1b19;
}
.sec-move:disabled {
  opacity: 0.3;
}
</style>
