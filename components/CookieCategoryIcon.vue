<template>
  <!-- Icono discreto de una categoría de cookies: sólo decorativo (el nombre va al lado), nunca una marca de verificación. -->
  <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" :data-category="category">
    <template v-if="category === 'necessary'">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </template>
    <template v-else-if="category === 'analytics'">
      <path d="M4 20h16" />
      <path d="M7 16v-5M12 16V8M17 16v-3" />
    </template>
    <template v-else-if="category === 'thirdParty'">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M10 9l5 3-5 3z" />
    </template>
    <template v-else>
      <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6l-5 4H4a1 1 0 0 0-1 1z" />
      <path d="M15 9a4 4 0 0 1 0 6" />
    </template>
  </svg>
</template>

<script setup lang="ts">
import type { OptionalCookieCategory } from '~/utils/cookieConsent'

/**
 * Los iconos de las categorías del aviso de cookies (utils/siteConsent.ts,
 * `design.categoryIcons`): candado para las necesarias, gráfico para las
 * analíticas, vídeo para el contenido de terceros y megáfono para la
 * publicidad. Decorativos y en el color del texto: ninguno sugiere que una
 * categoría esté aceptada.
 */
defineProps<{ category: OptionalCookieCategory | 'necessary' }>()
</script>
