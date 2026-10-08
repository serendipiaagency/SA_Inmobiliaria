<template>
  <div class="pcard" data-testid="mortgage-calculator">
    <h3 class="pcard-title">{{ t('mortgage.heading', 'Calcula cuánto necesitas para comprar esta vivienda') }}</h3>

    <!-- Las dos cifras que importan -->
    <div class="mt-4 grid gap-3 sm:grid-cols-2">
      <div class="rounded-xl bg-[#1f3a30] p-5 text-white">
        <p class="text-[11px] uppercase tracking-widest text-white/65">{{ t('mortgage.cashNeeded', 'Cuánto necesitas para comprar') }}</p>
        <p class="mt-1 text-3xl font-bold" data-testid="mortgage-cash-needed">{{ money(r.cashNeeded) }}</p>
        <p class="mt-1 text-[12px] text-white/70">{{ t('mortgage.cashNeededHint', 'Entrada + impuestos + gastos') }}</p>
      </div>
      <div class="rounded-xl border border-[#ece8e1] bg-[#faf8f4] p-5">
        <p class="text-[11px] uppercase tracking-widest text-stone-500">{{ t('mortgage.monthlyPay', 'Cuánto pagarías al mes') }}</p>
        <p class="mt-1 text-3xl font-bold text-ink" data-testid="mortgage-monthly">{{ money(r.monthly) }}</p>
        <p class="mt-1 text-[12px] text-stone-500">{{ t('mortgage.monthlyHint', 'Cuota de la hipoteca') }} · {{ years }} {{ t('mortgage.years', 'años') }} · {{ fmtPct(ratePct) }}</p>
      </div>
    </div>

    <!-- Reparto: entrada / financiado / impuestos y gastos -->
    <div class="mt-5" aria-hidden="true">
      <div class="flex h-2.5 overflow-hidden rounded-full bg-[#f1eee8]">
        <span class="bg-[#1f3a30]" :style="{ width: `${share.down}%` }" />
        <span class="bg-[#c2622d]" :style="{ width: `${share.costs}%` }" />
        <span class="bg-[#d6cfc4]" :style="{ width: `${share.loan}%` }" />
      </div>
      <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-stone-500">
        <span><i class="mr-1 inline-block h-2 w-2 rounded-full bg-[#1f3a30]" />{{ t('mortgage.downPayment', 'Entrada') }}</span>
        <span><i class="mr-1 inline-block h-2 w-2 rounded-full bg-[#c2622d]" />{{ t('mortgage.taxesAndFees', 'Impuestos y gastos') }}</span>
        <span><i class="mr-1 inline-block h-2 w-2 rounded-full bg-[#d6cfc4]" />{{ t('mortgage.financed', 'Financiado') }}</span>
      </div>
    </div>

    <div class="mt-6 grid gap-8 lg:grid-cols-2">
      <!-- Lo que se puede cambiar -->
      <div class="space-y-5">
        <label class="block">
          <span class="mb-1 flex justify-between text-sm"><span class="text-stone-500">{{ t('mortgage.downPayment', 'Entrada') }}</span><span class="font-semibold">{{ downPct }} % · {{ money(r.downPayment) }}</span></span>
          <input v-model.number="downPct" type="range" min="0" max="100" step="5" class="range" data-testid="mortgage-down" :aria-label="t('mortgage.downPayment', 'Entrada')" >
        </label>
        <label class="block">
          <span class="mb-1 flex justify-between text-sm"><span class="text-stone-500">{{ t('mortgage.interestRate', 'Interés anual') }}</span><span class="font-semibold">{{ fmtPct(ratePct) }}</span></span>
          <input v-model.number="ratePct" type="range" min="0" max="10" step="0.1" class="range" data-testid="mortgage-rate" :aria-label="t('mortgage.interestRate', 'Interés anual')" >
        </label>
        <label class="block">
          <span class="mb-1 flex justify-between text-sm"><span class="text-stone-500">{{ t('mortgage.term', 'Plazo') }}</span><span class="font-semibold">{{ years }} {{ t('mortgage.years', 'años') }}</span></span>
          <input v-model.number="years" type="range" min="5" max="40" step="1" class="range" data-testid="mortgage-years" :aria-label="t('mortgage.term', 'Plazo')" >
        </label>
        <div class="grid grid-cols-2 gap-3">
          <label class="block text-[12.5px] text-stone-500">
            {{ assumptions.taxLabel }} (%)
            <input v-model.number="taxPct" type="number" min="0" max="50" step="0.1" class="mc-input" data-testid="mortgage-tax" >
          </label>
          <!-- Con gastos fijos (Dubái), el % es lo que se añada aparte; los fijos ya van en el desglose. -->
          <label class="block text-[12.5px] text-stone-500">
            {{ assumptions.feesFixed ? t('mortgage.otherFees', 'Otros gastos') : assumptions.feesLabel }} (%)
            <input v-model.number="feesPct" type="number" min="0" max="20" step="0.1" class="mc-input" data-testid="mortgage-fees" >
          </label>
        </div>
      </div>

      <!-- Desglose -->
      <dl class="text-sm" data-testid="mortgage-breakdown">
        <div v-for="row in breakdown" :key="row.key" class="flex items-center justify-between gap-4 border-b border-[#f1eee8] py-2.5 last:border-0" :class="{ 'font-semibold text-ink': row.strong }">
          <dt :class="row.strong ? '' : 'text-stone-500'">{{ row.label }}</dt>
          <dd class="whitespace-nowrap font-medium">{{ money(row.value) }}</dd>
        </div>
      </dl>
    </div>

    <p class="mt-5 text-[12px] leading-relaxed text-stone-500" data-testid="mortgage-assumptions">
      <strong class="font-semibold text-stone-600">{{ t('mortgage.estimate', 'Estimación orientativa, no es una oferta de financiación.') }}</strong>
      {{ assumptions.note }}
      {{ t('mortgage.formula', 'Cuota con la fórmula de préstamo francés (cuota constante).') }}
    </p>

    <div v-if="rentalYield" class="mt-6 grid grid-cols-3 gap-3 text-center">
      <div class="rounded-xl border border-[#ece8e1] bg-white p-3">
        <p class="text-xl font-bold">{{ rentalYield }}%</p>
        <p class="mt-1 text-[11px] uppercase tracking-widest text-stone-400">{{ t('mortgage.rentability.grossAnnual', 'Rentabilidad bruta') }}</p>
      </div>
      <div class="rounded-xl border border-[#ece8e1] bg-white p-3">
        <p class="text-xl font-bold">{{ money(annualRent) }}</p>
        <p class="mt-1 text-[11px] uppercase tracking-widest text-stone-400">{{ t('mortgage.rentability.rentPerYear', 'Renta / año') }}</p>
      </div>
      <div class="rounded-xl border border-[#ece8e1] bg-white p-3">
        <p class="text-xl font-bold">{{ money(Math.round(annualRent / 12)) }}</p>
        <p class="mt-1 text-[11px] uppercase tracking-widest text-stone-400">{{ t('mortgage.rentability.rentPerMonth', 'Renta / mes') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { MORTGAGE_DEFAULTS, computeMortgage, purchaseAssumptions } from '~/utils/mortgage'

/**
 * «Hipoteca y costes» (#110): cuánto hay que tener para comprar (entrada +
 * impuestos + gastos) y cuánto se pagaría al mes. Los impuestos y gastos de
 * partida dependen del mercado de la agencia (utils/mortgage.ts) y se pueden
 * cambiar: no hay un tipo universal. Los importes, en la moneda de la agencia.
 */
const props = defineProps<{ price: number; rentalYield?: number | null; status?: string | null }>()
const { t } = useI18n()
const { format: money, base: baseCurrency } = useCurrency()

const offPlan = computed(() => props.status === 'new' || props.status === 'under_construction')
const assumptions = computed(() => purchaseAssumptions(baseCurrency.value, offPlan.value))

const downPct = ref<number>(MORTGAGE_DEFAULTS.downPct)
const ratePct = ref<number>(MORTGAGE_DEFAULTS.ratePct)
const years = ref<number>(MORTGAGE_DEFAULTS.years)
const taxPct = ref<number>(assumptions.value.taxPct)
const feesPct = ref<number>(assumptions.value.feesPct)
watch(assumptions, (a) => {
  taxPct.value = a.taxPct
  feesPct.value = a.feesPct
})

const r = computed(() => computeMortgage({ price: props.price, downPct: downPct.value, ratePct: ratePct.value, years: years.value, taxPct: taxPct.value || 0, feesPct: feesPct.value || 0, feesFixed: assumptions.value.feesFixed }))

const breakdown = computed(() => [
  { key: 'price', label: t('mortgage.price', 'Precio de la vivienda'), value: r.value.price },
  { key: 'down', label: t('mortgage.downPayment', 'Entrada'), value: r.value.downPayment },
  { key: 'taxes', label: `${t('mortgage.taxesEstimated', 'Impuestos estimados')} (${assumptions.value.taxLabel})`, value: r.value.taxes },
  { key: 'fees', label: assumptions.value.feesLabel, value: r.value.fees },
  { key: 'loan', label: t('mortgage.loan', 'Importe a financiar'), value: r.value.loan },
  { key: 'interest', label: t('mortgage.totalInterest', 'Intereses totales'), value: r.value.totalInterest },
  { key: 'cash', label: t('mortgage.cashNeeded', 'Cuánto necesitas para comprar'), value: r.value.cashNeeded, strong: true },
])

// Reparto para la barra: entrada, impuestos+gastos y financiado, sobre el total que se mueve.
const share = computed(() => {
  const costs = r.value.taxes + r.value.fees
  const total = r.value.downPayment + costs + r.value.loan || 1
  return { down: (r.value.downPayment / total) * 100, costs: (costs / total) * 100, loan: (r.value.loan / total) * 100 }
})

const fmtPct = (v: number) => `${Number(v).toLocaleString('es-ES', { maximumFractionDigits: 2 })} %`
const annualRent = computed(() => (props.rentalYield ? Math.round((props.price * props.rentalYield) / 100) : 0))
const rentalYield = computed(() => props.rentalYield)
</script>

<style scoped>
.range {
  width: 100%;
  height: 3px;
  appearance: none;
  border-radius: 9999px;
  background: #e7e4de;
}
.range:focus-visible {
  outline: 2px solid #16150f;
  outline-offset: 4px;
}
.range::-webkit-slider-thumb {
  appearance: none;
  height: 20px;
  width: 20px;
  border-radius: 9999px;
  background: #1f3a30;
  cursor: pointer;
  border: 3px solid #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}
.range::-moz-range-thumb {
  height: 20px;
  width: 20px;
  border-radius: 9999px;
  background: #1f3a30;
  cursor: pointer;
  border: 3px solid #fff;
}
.mc-input {
  margin-top: 4px;
  display: block;
  width: 100%;
  border: 1px solid #e7e3dc;
  border-radius: 9px;
  padding: 7px 10px;
  font-size: 14px;
  color: #1c1b19;
  background: #fff;
}
</style>
