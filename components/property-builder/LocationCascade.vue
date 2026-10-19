<template>
  <div class="grid gap-4 sm:grid-cols-2" data-testid="location-cascade">
    <PropertyBuilderField :spec="countrySpec" :model-value="countryChoice" :upload-folder="uploadFolder" @update:model-value="onCountry" />
    <PropertyBuilderField v-if="otherCountry" :spec="otherCountrySpec" :model-value="form.country" :upload-folder="uploadFolder" @update:model-value="(v) => (form.country = v)" />
    <template v-if="spain">
      <PropertyBuilderField :spec="regionSpec" :model-value="form.region" :upload-folder="uploadFolder" @update:model-value="onRegion" />
      <PropertyBuilderField :spec="provinceSpec" :model-value="form.province" :upload-folder="uploadFolder" @update:model-value="onProvince" />
      <PropertyBuilderField :spec="municipalitySpec" :model-value="form.municipality" :upload-folder="uploadFolder" @update:model-value="onMunicipality" />
      <PropertyBuilderField :spec="citySpec" :model-value="form.city" :upload-folder="uploadFolder" @update:model-value="(v) => (form.city = v)" />
    </template>
    <template v-else>
      <PropertyBuilderField v-for="f in freeSpecs" :key="f.key" :spec="f" :model-value="form[f.key]" :upload-folder="uploadFolder" @update:model-value="(v) => (form[f.key] = v)" />
    </template>
  </div>
</template>

<script setup lang="ts">
import type { FieldSpec } from '~/composables/usePropertyBuilderConfig'
import { buildGeoCascade, COUNTRY_SPAIN, withCurrent, type GeoCascade, type GeoRaw } from '~/utils/geoCascade'
import PropertyBuilderField from './PropertyBuilderField.vue'

/**
 * País → Comunidad → Provincia → Municipio → Localidad, dependientes entre sí y
 * sobre el catálogo geográfico del buscador. Guarda los mismos campos de texto
 * de siempre. Fuera de España (o sin catálogo) los cuatro niveles siguen siendo
 * texto libre: no se inventa un catálogo que no existe.
 */
const props = defineProps<{ form: Record<string, any>; uploadFolder: string }>()

const OTHER = '__otro__'
const geo = shallowRef<GeoCascade | null>(null)
let geoPromise: Promise<GeoRaw> | null = null
onMounted(async () => {
  try {
    geoPromise ||= $fetch<GeoRaw>('/geo/es.json')
    geo.value = buildGeoCascade(await geoPromise)
  } catch {
    geoPromise = null
  }
})

// Una ficha sin país guardado se presenta como España: es el único catálogo disponible.
const other = ref(false)
const country = computed(() => String(props.form.country ?? '').trim())
const spain = computed(() => !!geo.value && !other.value && (country.value === '' || country.value === COUNTRY_SPAIN))
const otherCountry = computed(() => other.value || (!!country.value && country.value !== COUNTRY_SPAIN))
const countryChoice = computed(() => (otherCountry.value ? OTHER : COUNTRY_SPAIN))

const mk = (key: string, label: string, options: string[], extra: Partial<FieldSpec> = {}): FieldSpec => ({ key, label, type: 'select', options, ...extra })

const countrySpec = computed(() => mk('country', 'País', [COUNTRY_SPAIN, OTHER], { optionLabels: { [OTHER]: 'Otro país…' }, recommended: true }))
const otherCountrySpec: FieldSpec = { key: 'country', label: 'Nombre del país', type: 'text' }
const freeSpecs: FieldSpec[] = [
  { key: 'region', label: 'Comunidad / región', type: 'text' },
  { key: 'province', label: 'Provincia', type: 'text' },
  { key: 'municipality', label: 'Municipio', type: 'text' },
  { key: 'city', label: 'Localidad', type: 'text', recommended: true },
]

const regionSpec = computed(() => mk('region', 'Comunidad / región', withCurrent(geo.value?.regions() ?? [], props.form.region)))
const provinceSpec = computed(() => mk('province', 'Provincia', withCurrent(props.form.region ? geo.value?.provinces(props.form.region) ?? [] : allProvinces(), props.form.province)))
const municipalitySpec = computed(() => mk('municipality', 'Municipio', withCurrent(props.form.province ? geo.value?.municipalities(props.form.province) ?? [] : [], props.form.municipality)))
const citySpec = computed(() =>
  mk('city', 'Localidad', withCurrent(props.form.municipality ? geo.value?.localities(props.form.municipality, props.form.province) ?? [] : [], props.form.city), { recommended: true }),
)

function allProvinces(): string[] {
  const g = geo.value
  return g ? g.regions().flatMap((r) => g.provinces(r)) : []
}

function onCountry(v: unknown) {
  other.value = v === OTHER
  props.form.country = v === OTHER ? '' : COUNTRY_SPAIN
}
function ensureSpain() {
  if (!props.form.country) props.form.country = COUNTRY_SPAIN
}
// Cambiar un nivel vacía los de debajo: un municipio de otra provincia no puede quedarse.
function onRegion(v: unknown) {
  ensureSpain()
  props.form.region = v || null
  props.form.province = null
  props.form.municipality = null
  props.form.city = null
}
function onProvince(v: unknown) {
  ensureSpain()
  props.form.province = v || null
  const region = v ? geo.value?.parentsOf(String(v)).region : null
  if (region) props.form.region = region
  props.form.municipality = null
  props.form.city = null
}
function onMunicipality(v: unknown) {
  ensureSpain()
  props.form.municipality = v || null
  props.form.city = v || null
}
</script>
