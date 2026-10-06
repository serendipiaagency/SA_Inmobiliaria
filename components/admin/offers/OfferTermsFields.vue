<template>
  <div class="grid gap-3 sm:grid-cols-2">
    <label class="block">
      <span class="ot-label">Importe ({{ currencyLabel }})</span>
      <input v-model.number="model.amount" type="number" min="1" step="1" class="input" placeholder="450000" :data-testid="`${testid}-amount`" >
    </label>
    <label class="block">
      <span class="ot-label">Vence el</span>
      <input v-model="model.expiration" type="date" class="input" :data-testid="`${testid}-expiration`" >
    </label>
    <label class="block sm:col-span-2">
      <span class="ot-label">Financiación</span>
      <select v-model="model.financeCondition" class="input" :data-testid="`${testid}-finance`">
        <option value="">Sin indicar</option>
        <option v-for="f in OFFER_FINANCE_CONDITIONS" :key="f" :value="f">{{ OFFER_FINANCE_LABELS[f] }}</option>
      </select>
    </label>
    <label class="block sm:col-span-2">
      <span class="ot-label">Condiciones</span>
      <textarea v-model="model.conditions" rows="2" class="input" placeholder="Entrega de llaves en 3 meses, incluye mobiliario de cocina…" :data-testid="`${testid}-conditions`" />
    </label>
  </div>
</template>

<script setup lang="ts">
import { OFFER_FINANCE_CONDITIONS, OFFER_FINANCE_LABELS, type OfferTerms } from '~/utils/pipelineCatalog'
import { currencySymbol, normalizeCurrency } from '~/utils/currency'

/**
 * Los términos de una oferta, iguales en la oferta, la contraoferta y la
 * nueva oferta (bloque N6, FASE 23): importe, condiciones, financiación y
 * vencimiento. La fecha se envía como AAAA-MM-DD y el servidor la guarda al
 * final de ese día.
 */
const model = defineModel<OfferTerms>({ required: true })
const props = withDefaults(defineProps<{ testid?: string; currency?: string | null }>(), { testid: 'offer-terms', currency: null })
// La oferta lleva su propia moneda: la de la oferta que se mueve o, en una
// nueva, la que le pondrá el servidor (la de la agencia si la eligió).
const { recordCode } = useAgencyCurrency()
const currencyLabel = computed(() => {
  const code = props.currency || recordCode.value
  return normalizeCurrency(code) ? currencySymbol(code) : String(code).toUpperCase()
})
</script>

<style scoped>
.ot-label {
  @apply mb-1 block text-[12px] font-medium text-stone-600;
}
</style>
