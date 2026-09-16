<template>
  <PropertyList resource="properties" />
</template>

<script setup lang="ts">
import PropertyList from '~/components/property-list/PropertyList.vue'
import { PROPERTY_LIST_CONFIG } from '~/composables/usePropertyListConfig'

// Mismo listado que Propiedades (web) — no una copia. Lo propio de 2ª mano
// (estados disponible/vendida, el filtro venta/alquiler, la acción de marcar
// vendida) está declarado en PROPERTY_LIST_CONFIG['properties'].
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: PROPERTY_LIST_CONFIG.properties.title })
</script>
