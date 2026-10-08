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
  </div>
</template>

<script setup lang="ts">
import InspectorSection from '../inspector/InspectorSection.vue'
import ToggleField from '../inspector/fields/ToggleField.vue'
import TextField from '../inspector/fields/TextField.vue'
import { PAGE_CORE_LABELS, PAGE_CORE_SOURCES, type PageCoreKind } from '~/utils/siteBuilder/pages'

/**
 * Inspector de la zona dinámica de una página funcional (Propiedades, Ficha,
 * Blog — utils/siteBuilder/pages.ts). Explica qué es y dónde se gestiona lo
 * que enseña. En la ficha, además, las opciones de PAGE_CORE_OPTIONS: si se
 * enseñan las propiedades destacadas y con qué título.
 */
const props = defineProps<{ content: Record<string, any> }>()
const label = computed(() => PAGE_CORE_LABELS[props.content.core as PageCoreKind] || 'Contenido de la página')
const source = computed(() => PAGE_CORE_SOURCES[props.content.core as PageCoreKind] || null)
</script>
