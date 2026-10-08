<template>
  <div class="rounded-xl border border-emerald-100 bg-emerald-50/30 p-5" data-testid="ficha-monthly-cost">
    <p class="text-[13px] font-semibold text-emerald-800">{{ t('decisionPanel.monthlyCost.eyebrow', 'Coste mensual estimado') }}</p>
    <ul class="mt-2 divide-y divide-emerald-100/70">
      <li class="flex items-center justify-between py-2.5 text-sm">
        <span class="text-stone-500">{{ t('decisionPanel.monthlyCost.mortgage', 'Hipoteca estimada') }}</span>
        <span class="font-semibold">{{ formatPrice(cost.mortgage) }}</span>
      </li>
      <li v-if="cost.community != null" class="flex items-center justify-between py-2.5 text-sm">
        <span class="text-stone-500">{{ t('decisionPanel.monthlyCost.community', 'Comunidad') }}</span>
        <span class="font-semibold">{{ formatPrice(cost.community) }}</span>
      </li>
      <li v-if="cost.ibi != null" class="flex items-center justify-between py-2.5 text-sm">
        <span class="text-stone-500">{{ t('decisionPanel.monthlyCost.ibi', 'IBI (prorrateado)') }}</span>
        <span class="font-semibold">{{ formatPrice(cost.ibi) }}</span>
      </li>
      <li v-if="cost.garbage != null" class="flex items-center justify-between py-2.5 text-sm">
        <span class="text-stone-500">{{ t('decisionPanel.monthlyCost.garbage', 'Tasa de basuras (prorrateada)') }}</span>
        <span class="font-semibold">{{ formatPrice(cost.garbage) }}</span>
      </li>
      <li class="flex items-center justify-between py-3 text-sm font-semibold">
        <span>{{ t('decisionPanel.monthlyCost.total', 'Total mensual') }}</span>
        <span>{{ formatPrice(cost.total) }}</span>
      </li>
    </ul>
    <p class="mt-1 text-[11px] leading-relaxed text-stone-400">
      {{ t('decisionPanel.monthlyCost.assumptions', 'Estimado con 20 % de entrada, 3,5 % de interés y 25 años.') }}
      {{ cost.community == null && cost.ibi == null ? t('decisionPanel.monthlyCost.missingCosts', 'No incluye comunidad ni IBI: esta vivienda no los tiene indicados.') : '' }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { MORTGAGE_DEFAULTS, computeMortgage } from '~/utils/mortgage'

/**
 * Coste mensual estimado (#110; en #111 va junto a la calculadora, en
 * «Hipoteca y costes»): la misma cuota que la calculadora con sus valores de
 * partida (utils/mortgage.ts) más la comunidad, el IBI y la basura de esta
 * vivienda si constan. Nada inventado: sin seguro supuesto.
 */
const props = defineProps<{ price?: number | null; serviceChargeAnnual?: number | null; details?: Record<string, any> | null }>()
const { t } = useI18n()
const { format: formatPrice } = useCurrency()

const cost = computed(() => {
  const mortgage = computeMortgage({ price: props.price || 0, downPct: MORTGAGE_DEFAULTS.downPct, ratePct: MORTGAGE_DEFAULTS.ratePct, years: MORTGAGE_DEFAULTS.years, taxPct: 0, feesPct: 0 }).monthly
  const d = props.details || {}
  const community = Number(d.communityFeeMonthly) > 0 ? Math.round(Number(d.communityFeeMonthly)) : props.serviceChargeAnnual ? Math.round(props.serviceChargeAnnual / 12) : null
  const ibi = Number(d.ibiAnnual) > 0 ? Math.round(Number(d.ibiAnnual) / 12) : null
  const garbage = Number(d.garbageTaxAnnual) > 0 ? Math.round(Number(d.garbageTaxAnnual) / 12) : null
  return { mortgage, community, ibi, garbage, total: mortgage + (community || 0) + (ibi || 0) + (garbage || 0) }
})
</script>
