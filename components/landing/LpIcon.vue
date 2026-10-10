<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="name === 'builder'"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 9h18M8 9v11" /></template>
    <template v-else-if="name === 'properties'"><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v10h13V10" /><path d="M10 20v-6h4v6" /></template>
    <template v-else-if="name === 'crm'"><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 4.5a3.2 3.2 0 0 1 0 6.4M17.5 13.8A5.5 5.5 0 0 1 21 19" /></template>
    <template v-else-if="name === 'agenda'"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /><path d="m9.5 15 2 2 3.5-3.5" /></template>
    <template v-else-if="name === 'deals'"><path d="M4 18 10 12l3 3 7-7" /><path d="M15 8h5v5" /></template>
    <template v-else-if="name === 'intelligence'"><path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.5l-1.8-5.9L4.5 10.8 10.2 9z" /><path d="M19 3v3M20.5 4.5h-3" /></template>
    <template v-else-if="name === 'check'"><path d="m5 12.5 4.5 4.5L19 7.5" /></template>
    <template v-else-if="name === 'arrow'"><path d="M5 12h14M13 6l6 6-6 6" /></template>
    <template v-else-if="name === 'menu'"><path d="M4 7h16M4 12h16M4 17h16" /></template>
    <template v-else-if="name === 'close'"><path d="M6 6l12 12M18 6 6 18" /></template>
    <template v-else-if="name === 'mail'"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></template>
    <template v-else-if="name === 'inbox'"><path d="M4 13h4l2 3h4l2-3h4" /><path d="M6 5h12l3 8v6H3v-6z" /></template>
    <template v-else-if="name === 'eye'"><path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></template>
    <template v-else-if="name === 'send'"><path d="M21 3 10.5 13.5" /><path d="M21 3 14.5 21l-4-7.5L3 9.5z" /></template>
    <template v-else-if="name === 'plus'"><path d="M12 5v14M5 12h14" /></template>
    <template v-else-if="name === 'chevron'"><path d="m6 9 6 6 6-6" /></template>
    <template v-else-if="name === 'lock'"><rect x="5" y="10" width="14" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></template>
    <template v-else-if="name === 'globe'"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 3.8 6 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-6-3.8-9S9.5 5.7 12 3z" /></template>
    <template v-else-if="name === 'users'"><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></template>
    <template v-else-if="name === 'support'"><path d="M4 12a8 8 0 0 1 16 0v4a2 2 0 0 1-2 2h-2v-6h4M4 12v4a2 2 0 0 0 2 2h2v-6H4" /></template>
    <template v-else-if="name === 'tag'"><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.3" /></template>
    <template v-else><circle cx="12" cy="12" r="9" /></template>
  </svg>
</template>

<script setup lang="ts">
/** Iconos de línea de la landing (trazo fino, sin librería): uno por nombre. */
defineProps<{ name: string }>()
</script>
