<template>
  <!-- Con datos: la tabla de la propiedad. Sin ellos, en la web y en Vista previa no sale nada;
       en el lienzo, el aviso de que no saldrá (megaprompt «ficha», 8.6). -->
  <div v-if="visible" class="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-10" data-testid="energy-block">
    <p v-if="mode === 'builder' && sampleName" class="mb-2 text-[11.5px] text-stone-400">Ejemplo con «{{ sampleName }}»: en cada ficha, los datos de su propiedad.</p>
    <PropertyEnergyCard :data="data" :options="options" />
  </div>
  <div v-else-if="mode === 'builder'" class="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-10" data-testid="energy-block-empty">
    <div class="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-[12.5px] leading-relaxed text-amber-800">
      <strong>Eficiencia energética.</strong>
      <template v-if="loading">Cargando la propiedad de ejemplo…</template>
      <template v-else-if="!onFicha">Esta sección enseña la etiqueta energética de la propiedad de una ficha: fuera de la página «Ficha de propiedad» no sale en la web.</template>
      <template v-else>Esta sección se ocultará en la web pública porque la propiedad no tiene datos disponibles.</template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { energyCardVisible, energyData, normalizeEnergyOptions } from '~/utils/energyCertificate'
import { FICHA_PROPERTY_KEY, SITE_CANVAS_PAGE_KEY, useFichaSample } from '~/composables/useFichaProperty'

/**
 * Bloque «Eficiencia energética» de la biblioteca del Constructor Web
 * (megaprompt «ficha», 6): la etiqueta A–G de la propiedad de la ficha, con
 * sus opciones de presentación (las mismas que la sección de la zona). Los
 * valores nunca se guardan en el bloque: en la web los da la ficha
 * (FICHA_PROPERTY_KEY); en el lienzo y en Vista previa, la propiedad de
 * ejemplo de la empresa.
 */
const props = defineProps<{ content: Record<string, any>; mode: 'production' | 'builder' | 'preview' }>()
const options = computed(() => normalizeEnergyOptions(props.content))

const fromFicha = inject(FICHA_PROPERTY_KEY, null)
const editing = props.mode !== 'production'
const { sample, loading } = editing ? useFichaSample() : { sample: ref(null), loading: ref(false) }
// En el lienzo, la página abierta la dice el propio lienzo; en la web, sólo hay propiedad dentro de una ficha.
const canvasPage = inject(SITE_CANVAS_PAGE_KEY, null)
const onFicha = computed(() => !editing || !canvasPage || canvasPage.value === 'ficha-propiedad')
const payload = computed(() => (editing ? (onFicha.value ? sample.value?.property : null) : fromFicha?.value) || null)
const data = computed(() => energyData(payload.value?.project, payload.value?.details))
const visible = computed(() => !!payload.value && energyCardVisible(data.value, options.value))
const sampleName = computed(() => (editing ? String(sample.value?.property?.project?.name || '') : ''))
</script>
