<template>
  <!-- Un icono por nivel geográfico, del mismo trazo: comunidad (mapa), provincia (mapa con marco), municipio (edificios), barrio (pin), zona (capas), CP (sobre), calle (vía) -->
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="kind === 'region'"><path d="M9 20 3 17V4l6 3 6-3 6 3v13l-6-3-6 3z" /><path d="M9 7v13M15 4v13" /></template>
    <template v-else-if="kind === 'province'"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16" /></template>
    <template v-else-if="kind === 'municipality'"><path d="M3 21h18" /><path d="M5 21V8l5-3 5 3v13" /><path d="M15 21v-9l4 2v7" /><path d="M8 10h1M8 14h1M8 18h1" /></template>
    <template v-else-if="kind === 'neighborhood'"><path d="M12 21s-7-6.2-7-11.3a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></template>
    <template v-else-if="kind === 'zone'"><path d="m12 3 9 5-9 5-9-5 9-5z" /><path d="m3 13 9 5 9-5" /><path d="m3 17 9 5 9-5" /></template>
    <template v-else-if="kind === 'postalCode'"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></template>
    <template v-else><path d="M4 21 9 3M20 21 15 3" /><path d="M12 7v2M12 12v2M12 17v2" /></template>
  </svg>
</template>

<script setup lang="ts">
import type { LocationKind } from '~/utils/searchState'
defineProps<{ kind: LocationKind }>()
</script>
