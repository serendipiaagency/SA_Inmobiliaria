<template>
  <ZoneGuide v-if="data" :data="data" />
</template>

<script setup lang="ts">
import ZoneGuide from '~/components/zones/ZoneGuide.vue'
import { useZoneGuide } from '~/composables/useZoneGuide'

const route = useRoute()
const { data } = await useZoneGuide([String(route.params.region), String(route.params.municipio), String(route.params.barrio)])
</script>
