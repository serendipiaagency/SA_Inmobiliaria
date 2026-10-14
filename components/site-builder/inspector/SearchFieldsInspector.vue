<template>
  <div class="mt-2 border-t border-line pt-3" data-testid="search-fields-inspector">
    <p class="mb-2 text-[12px] font-semibold text-ink">Tipo de inmueble</p>
    <TextField label="Texto del campo vacío" :model-value="content.typePlaceholder || ''" placeholder="Cualquiera" data-testid="search-type-placeholder" @update:model-value="(v) => set('typePlaceholder', v)" />
    <ToggleField label="Número de propiedades por tipo" :model-value="type.showCounts" data-testid="search-type-counts" @update:model-value="(v) => set('typeShowCounts', v)" />

    <p class="mb-2 mt-3 text-[12px] font-semibold text-ink">Ubicación</p>
    <TextField label="Texto del campo vacío" :model-value="content.locationPlaceholder || ''" placeholder="Municipio, barrio, zona, provincia o código postal" data-testid="search-location-placeholder" @update:model-value="(v) => set('locationPlaceholder', v)" />
    <SelectField label="Sugerencias como máximo" :model-value="String(location.maxSuggestions)" :options="SEARCH_SUGGESTION_CHOICES.map((n) => ({ value: String(n), label: String(n) }))" data-testid="search-location-suggestions" @update:model-value="(v) => set('locationSuggestions', Number(v))" />
    <ToggleField label="Número de propiedades en cada sugerencia" :model-value="location.showCounts" data-testid="search-location-counts" @update:model-value="(v) => set('locationShowCounts', v)" />

    <p class="mb-1 mt-2 text-[12px] text-stone-600">Ubicaciones destacadas</p>
    <p class="mb-2 text-[11px] leading-relaxed text-stone-400">Salen las primeras cuando el campo está vacío (hasta {{ SEARCH_FEATURED_MAX }}). No limitan la búsqueda: cualquier otro sitio sigue encontrándose.</p>
    <div data-testid="search-location-featured">
      <LocationAutocomplete :model-value="featuredSelections" variant="panel" :keep-recent="false" :show-counts="false" @update:model-value="setFeatured" />
    </div>

    <p class="mb-1 mt-3 text-[12px] text-stone-600">Herramientas del mapa en «Ubicación»</p>
    <ToggleField label="«Seleccionar en el mapa»" :model-value="location.mapSelect" data-testid="search-location-map-select" @update:model-value="(v) => set('locationMapSelect', v)" />
    <ToggleField label="«Dibujar una zona en el mapa»" :model-value="location.mapDraw" data-testid="search-location-map-draw" @update:model-value="(v) => set('locationMapDraw', v)" />
    <ToggleField label="«Buscar alrededor de un punto»" :model-value="location.mapNearby" data-testid="search-location-map-nearby" @update:model-value="(v) => set('locationMapNearby', v)" />
    <p class="mt-1 text-[11px] leading-relaxed text-stone-400">Sólo presentación: qué propiedades salen lo decide siempre la búsqueda real. Las mismas opciones valen en el Hero y en el panel de Propiedades, cada bloque con las suyas.</p>
  </div>
</template>

<script setup lang="ts">
import TextField from './fields/TextField.vue'
import ToggleField from './fields/ToggleField.vue'
import SelectField from './fields/SelectField.vue'
import LocationAutocomplete from '~/components/search/LocationAutocomplete.vue'
import { SEARCH_FEATURED_MAX, SEARCH_SUGGESTION_CHOICES, searchLocationOptions, searchTypeOptions } from '~/utils/searchConfig'
import { locationKindOfId, type LocationSelection } from '~/utils/searchState'

/**
 * Inspector compartido de «Tipo de inmueble» y «Ubicación» del buscador
 * (Parte III del buscador global): lo usan Hero › Buscador y Propiedades ›
 * Buscador del catálogo, con las mismas claves en el contenido del bloque
 * (utils/searchConfig.ts). Las destacadas se eligen con el mismo
 * autocompletado real de la web; sólo se guarda lo que difiere de lo de partida.
 */
const props = defineProps<{ content: Record<string, any> }>()
const type = computed(() => searchTypeOptions(props.content))
const location = computed(() => searchLocationOptions(props.content))
const featuredSelections = computed<LocationSelection[]>(() => location.value.featured.map((f) => ({ kind: locationKindOfId(f.id) || 'municipality', value: f.value, id: f.id, context: f.context ?? null })))
function set(key: string, value: unknown) {
  // eslint-disable-next-line vue/no-mutating-props -- el contenido del bloque es el estado del editor, pensado para editarse desde el inspector.
  props.content[key] = value
}
function setFeatured(list: LocationSelection[]) {
  set(
    'locationFeatured',
    list
      .filter((l) => l.id)
      .slice(0, SEARCH_FEATURED_MAX)
      .map((l) => ({ id: l.id!, value: l.value, context: l.context ?? null })),
  )
}
</script>
