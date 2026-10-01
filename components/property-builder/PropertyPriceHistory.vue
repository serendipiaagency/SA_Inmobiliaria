<template>
  <section class="pe-card mt-6 px-6 py-5 sm:px-8" data-testid="property-price-history">
    <h2 class="mb-1 text-[15px] font-medium text-ink">Histórico de precios</h2>
    <p class="mb-3 text-[12px] text-stone-500">Cada cambio real de precio — desde la ficha o en bloque — deja aquí su fila. No se edita a mano.</p>
    <p v-if="!rows.length" class="py-4 text-center text-sm text-stone-400">Todavía no ha cambiado de precio.</p>
    <ul v-else class="divide-y divide-line">
      <li v-for="(r, i) in rows" :key="`${r.recordedAt}-${i}`" class="flex items-baseline justify-between py-2" data-testid="property-price-history-row">
        <span class="text-[13px] font-medium text-ink">{{ formatCurrency(r.price) }}</span>
        <span class="text-[12px] text-stone-500">{{ formatDateTime(r.recordedAt) }}</span>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { formatDateTime } from '~/composables/useClientConfig'

/**
 * FASE 28 §94 — PropertyPriceHistory de la ficha (más reciente primero). Lo
 * sirve el mismo GET que carga el editor (`priceHistory`), sin ruta propia.
 */
defineProps<{ rows: { price: number; recordedAt: string }[] }>()
const { format: formatCurrency } = useCurrency()
</script>
