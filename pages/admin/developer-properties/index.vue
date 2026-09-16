<template>
  <PropertyList resource="developer-properties" />
</template>

<script setup lang="ts">
import PropertyList from '~/components/property-list/PropertyList.vue'
import { PROPERTY_LIST_CONFIG } from '~/composables/usePropertyListConfig'

// Un solo listado para los dos catálogos de propiedades, igual que hay un
// solo PropertyBuilder para los dos editores. Lo que diferencia a este
// —título, estados, orden, columnas, la acción de publicar— está declarado en
// PROPERTY_LIST_CONFIG['developer-properties'].
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: PROPERTY_LIST_CONFIG['developer-properties'].title })
</script>
