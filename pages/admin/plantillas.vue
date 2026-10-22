<template>
  <div class="max-w-5xl" data-testid="plantillas-module">
    <div class="mb-6">
      <h1 class="text-2xl font-semibold tracking-tight">Plantillas</h1>
      <p class="mt-1 max-w-3xl text-sm text-stone-500">
        Todos tus diseños en un sitio. Las <strong>plantillas de exportación</strong> generan dossiers, fichas y piezas de redes; las <strong>plantillas de cartel</strong>, carteles de escaparate y folletos. Cada plantilla muestra una miniatura de su diseño.
      </p>
    </div>

    <!-- Pestañas: separan los dos tipos dentro de la misma sección -->
    <div class="mb-5 flex gap-1 border-b border-line">
      <button
        v-for="t in TABS"
        :key="t.key"
        type="button"
        class="-mb-px border-b-2 px-4 py-2 text-sm font-medium transition"
        :class="tab === t.key ? 'border-ink text-ink' : 'border-transparent text-stone-500 hover:text-ink'"
        :data-testid="`plantillas-tab-${t.key}`"
        @click="tab = t.key"
      >
        {{ t.label }}
      </button>
    </div>

    <!-- Se montan ambas listas pero sólo se muestra la activa, para no refetch al cambiar de pestaña. -->
    <div v-show="tab === 'export'">
      <AdminPlantillasExportTemplatesList />
    </div>
    <div v-show="tab === 'cartel'">
      <AdminPlantillasPosterTemplatesList />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * «Plantillas» (panel): unifica en una sola entrada de menú las antiguas
 * «Plantillas de Export» (Asset Export Studio) y «Plantillas de cartel»
 * (Carteles de escaparate), separándolas por pestañas. Cada plantilla lleva al
 * lado una miniatura esquemática de su diseño. Permiso: Portal Web.
 */
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'Plantillas' })

const TABS = [
  { key: 'export' as const, label: 'De exportación' },
  { key: 'cartel' as const, label: 'De cartel' },
]
const route = useRoute()
// Permite enlazar directamente a una pestaña (?tipo=cartel) y conservar los
// enlaces antiguos a los dos módulos.
const initial = route.query.tipo === 'cartel' ? 'cartel' : 'export'
const tab = ref<'export' | 'cartel'>(initial)
</script>
