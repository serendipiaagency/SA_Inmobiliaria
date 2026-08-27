<template>
  <div class="space-y-6">
    <div class="grid gap-4 sm:grid-cols-2">
      <PropertyBuilderField
        v-for="f in fields"
        :key="f.key"
        :spec="f"
        :model-value="form[f.key]"
        :upload-folder="uploadFolder"
        @update:model-value="(v) => (form[f.key] = v)"
      />
    </div>

    <div>
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p class="text-[11px] font-semibold uppercase tracking-widest text-stone-500">Mapa</p>
        <button type="button" class="btn-quiet" :disabled="geocoding" @click="geocode">
          {{ geocoding ? 'Buscando…' : 'Buscar dirección en el mapa' }}
        </button>
      </div>
      <p v-if="geocodeError" class="mb-2 text-xs font-medium text-red-600">{{ geocodeError }}</p>
      <ClientOnly>
        <LocationPicker
          :lat="form[latField]"
          :lng="form[lngField]"
          @update:lat="(v) => (form[latField] = v)"
          @update:lng="(v) => (form[lngField] = v)"
        />
        <template #fallback>
          <div class="flex h-80 items-center justify-center rounded-xl border border-line bg-stone-50 text-sm text-stone-400">Cargando mapa…</div>
        </template>
      </ClientOnly>
      <p class="mt-2 text-[11px] text-stone-400">
        Haz clic en el mapa o arrastra el marcador para ajustar la posición exacta.
        Lat: {{ formatCoord(form[latField]) }} · Lng: {{ formatCoord(form[lngField]) }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { FieldSpec } from '~/composables/usePropertyBuilderConfig'
import PropertyBuilderField from './PropertyBuilderField.vue'
import LocationPicker from './LocationPicker.client.vue'

const props = defineProps<{
  fields: FieldSpec[]
  form: Record<string, any>
  latField: string
  lngField: string
  uploadFolder: string
}>()

const geocoding = ref(false)
const geocodeError = ref('')

async function geocode() {
  geocoding.value = true
  geocodeError.value = ''
  try {
    const res = await $fetch<{ results: { lat: number; lng: number; label: string }[] }>('/api/admin/geocode', {
      query: {
        street: props.form.street,
        streetNumber: props.form.streetNumber,
        postalCode: props.form.postalCode,
        city: props.form.city,
        country: props.form.country,
      },
    })
    const first = res.results[0]
    if (!first) {
      geocodeError.value = 'No se ha encontrado ninguna coincidencia para esta dirección. Ajusta el marcador manualmente en el mapa.'
      return
    }
    props.form[props.latField] = first.lat
    props.form[props.lngField] = first.lng
  } catch {
    geocodeError.value = 'No se pudo geocodificar la dirección ahora mismo. Ajusta el marcador manualmente en el mapa.'
  } finally {
    geocoding.value = false
  }
}

function formatCoord(v: number | null | undefined) {
  return typeof v === 'number' ? v.toFixed(6) : '—'
}
</script>
