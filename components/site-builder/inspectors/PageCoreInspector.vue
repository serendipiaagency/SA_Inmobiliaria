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
    <!-- Ficha (#110): orden y visibilidad de sus secciones, para todas las fichas -->
    <InspectorSection v-if="content.core === 'property-detail'" title="Secciones de la ficha">
      <p class="mb-3 text-[12px] leading-relaxed text-stone-500">
        Ordena con las flechas y desmarca las que no quieras enseñar. Vale para todas las fichas. Una sección sin datos en una propiedad no aparece aunque esté marcada. La galería, la cabecera, el contacto y las similares se quedan en su sitio.
      </p>
      <ul class="space-y-1" data-testid="page-core-sections">
        <li v-for="(s, i) in sectionList" :key="s.key" class="flex items-center gap-2 rounded-lg border border-line bg-white px-2.5 py-1.5" :class="{ 'opacity-60': !s.visible }" :data-section="s.key">
          <input type="checkbox" class="h-4 w-4 shrink-0 accent-ink" :checked="s.visible" :aria-label="`Mostrar «${s.label}»`" data-testid="page-core-section-toggle" @change="toggle(i)" >
          <span class="min-w-0 flex-1 truncate text-[12.5px]" :class="s.visible ? 'text-ink' : 'text-stone-400 line-through'">{{ s.label }}</span>
          <button type="button" class="sec-move" :disabled="i === 0" :aria-label="`Subir «${s.label}»`" data-testid="page-core-section-up" @click="move(i, -1)">↑</button>
          <button type="button" class="sec-move" :disabled="i === sectionList.length - 1" :aria-label="`Bajar «${s.label}»`" data-testid="page-core-section-down" @click="move(i, 1)">↓</button>
        </li>
      </ul>
      <button v-if="content.sections" type="button" class="btn-quiet mt-3 !text-[12px]" data-testid="page-core-sections-reset" @click="reset">Volver al orden de partida</button>
    </InspectorSection>
  </div>
</template>

<script setup lang="ts">
import InspectorSection from '../inspector/InspectorSection.vue'
import ToggleField from '../inspector/fields/ToggleField.vue'
import TextField from '../inspector/fields/TextField.vue'
import { FICHA_SECTIONS, PAGE_CORE_LABELS, PAGE_CORE_SOURCES, normalizeFichaSections, type FichaSectionSetting, type PageCoreKind } from '~/utils/siteBuilder/pages'

/**
 * Inspector de la zona dinámica de una página funcional (Propiedades, Ficha,
 * Blog — utils/siteBuilder/pages.ts). Explica qué es y dónde se gestiona lo
 * que enseña. En la ficha, además, las opciones de PAGE_CORE_OPTIONS: si se
 * enseñan las propiedades destacadas y con qué título, y el orden y la
 * visibilidad de sus secciones (FICHA_SECTIONS).
 */
const props = defineProps<{ content: Record<string, any> }>()
const label = computed(() => PAGE_CORE_LABELS[props.content.core as PageCoreKind] || 'Contenido de la página')
const source = computed(() => PAGE_CORE_SOURCES[props.content.core as PageCoreKind] || null)

const SECTION_LABELS = Object.fromEntries(FICHA_SECTIONS.map((x) => [x.key, x.label]))
const sectionList = computed(() => normalizeFichaSections(props.content.sections).map((x) => ({ ...x, label: SECTION_LABELS[x.key] })))
// Se guarda la lista entera, en orden: el lienzo y la web la leen igual.
function saveSections(list: FichaSectionSetting[]) {
  props.content.sections = list.map(({ key, visible }) => ({ key, visible }))
}
function toggle(i: number) {
  const list = normalizeFichaSections(props.content.sections)
  list[i] = { ...list[i], visible: !list[i].visible }
  saveSections(list)
}
function move(i: number, dir: -1 | 1) {
  const list = normalizeFichaSections(props.content.sections)
  const j = i + dir
  if (j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j], list[i]]
  saveSections(list)
}
function reset() {
  delete props.content.sections
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
