<template>
  <div class="grid gap-8 rounded-2xl border border-emerald-100 bg-emerald-50/30 p-6 sm:p-8 lg:grid-cols-2">
    <!-- Mortgage -->
    <div>
      <h3 class="filter-title">{{ t('mortgage.title', 'Hipoteca') }}</h3>
      <div class="space-y-5">
        <div>
          <div class="mb-1 flex justify-between text-sm">
            <span class="text-stone-500">{{ t('mortgage.downPayment', 'Entrada') }}</span>
            <span class="font-semibold">{{ downPct }}% · {{ money(downPayment) }}</span>
          </div>
          <input v-model.number="downPct" type="range" min="10" max="60" step="5" class="range" />
        </div>
        <div>
          <div class="mb-1 flex justify-between text-sm">
            <span class="text-stone-500">{{ t('mortgage.interestRate', 'Interés anual') }}</span>
            <span class="font-semibold">{{ rate }}%</span>
          </div>
          <input v-model.number="rate" type="range" min="1" max="8" step="0.1" class="range" />
        </div>
        <div>
          <div class="mb-1 flex justify-between text-sm">
            <span class="text-stone-500">{{ t('mortgage.term', 'Plazo') }}</span>
            <span class="font-semibold">{{ years }} {{ t('mortgage.years', 'años') }}</span>
          </div>
          <input v-model.number="years" type="range" min="5" max="35" step="1" class="range" />
        </div>
      </div>
      <div class="mt-6 rounded-2xl bg-emerald-800 p-6 text-white">
        <p class="text-[11px] uppercase tracking-widest2 text-white/60">{{ t('mortgage.estimatedMonthly', 'Cuota mensual estimada') }}</p>
        <p class="mt-1 font-serif text-4xl">{{ money(monthly) }}</p>
        <p class="mt-2 text-[13px] text-white/70">
          {{ t('mortgage.financing', 'Financias') }} {{ money(loan) }} · {{ t('mortgage.totalInterest', 'Total intereses') }} {{ money(totalInterest) }}
        </p>
      </div>
    </div>

    <!-- Costs + rentability -->
    <div class="space-y-8">
      <div>
        <h3 class="filter-title">{{ t('mortgage.costsTitle', 'Costes de compra en Dubái (estimados)') }}</h3>
        <ul class="divide-y divide-line border-y border-line bg-white/60">
          <li v-for="c in costs" :key="c.label" class="flex items-center justify-between px-1 py-3.5 text-sm">
            <span class="text-stone-500">{{ c.label }}<span v-if="c.pct" class="text-stone-400"> · {{ c.pct }}%</span></span>
            <span class="font-medium">{{ money(c.value) }}</span>
          </li>
          <li class="flex items-center justify-between px-1 py-3.5 text-sm font-semibold">
            <span>{{ t('mortgage.totalWithCosts', 'Total aproximado con gastos') }}</span>
            <span>{{ money(price + totalCosts) }}</span>
          </li>
        </ul>
        <p class="mt-3 text-[12px] leading-relaxed text-stone-400">
          {{ t('mortgage.disclaimer', 'A diferencia de España, en Dubái no existe un impuesto anual sobre la propiedad (equivalente al IBI) ni IVA sobre el precio de venta de vivienda residencial. Los gastos de comunidad (service charge) del edificio son un coste anual recurrente que varía según el edificio y no está incluido aquí.') }}
        </p>
      </div>

      <div v-if="rentalYield">
        <h3 class="filter-title">{{ t('mortgage.rentability.title', 'Rentabilidad estimada') }}</h3>
        <div class="grid grid-cols-3 gap-3 text-center">
          <div class="rounded-xl border border-line bg-white p-4">
            <p class="font-serif text-2xl">{{ rentalYield }}%</p>
            <p class="mt-1 text-[11px] uppercase tracking-widest text-stone-400">{{ t('mortgage.rentability.grossAnnual', 'Bruta anual') }}</p>
          </div>
          <div class="rounded-xl border border-line bg-white p-4">
            <p class="font-serif text-2xl">{{ money(annualRent) }}</p>
            <p class="mt-1 text-[11px] uppercase tracking-widest text-stone-400">{{ t('mortgage.rentability.rentPerYear', 'Renta / año') }}</p>
          </div>
          <div class="rounded-xl border border-line bg-white p-4">
            <p class="font-serif text-2xl">{{ money(Math.round(annualRent / 12)) }}</p>
            <p class="mt-1 text-[11px] uppercase tracking-widest text-stone-400">{{ t('mortgage.rentability.rentPerMonth', 'Renta / mes') }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ price: number; rentalYield?: number | null; status?: string | null }>()
const { t } = useI18n()
const isOffPlan = computed(() => props.status === 'new' || props.status === 'under_construction')

const downPct = ref(20)
const rate = ref(4.5)
const years = ref(25)

const price = computed(() => props.price || 0)
const downPayment = computed(() => Math.round((price.value * downPct.value) / 100))
const loan = computed(() => price.value - downPayment.value)
const monthly = computed(() => {
  const r = rate.value / 100 / 12
  const n = years.value * 12
  if (r === 0) return Math.round(loan.value / n)
  return Math.round((loan.value * r) / (1 - Math.pow(1 + r, -n)))
})
const totalInterest = computed(() => Math.max(0, monthly.value * years.value * 12 - loan.value))

// Real Dubai Land Department cost structure — never Spanish tax terms (ITP,
// notaría, IBI) on a Dubai-market site. Off-plan and ready-unit purchases go
// through different registration processes (Oqood + trustee vs. DLD title
// registration), so the breakdown branches on the property's real status.
const costs = computed(() => {
  const rows: { label: string; pct?: number; value: number }[] = [{ label: t('mortgage.cost.transferFee', 'Tasa de transferencia (DLD)'), pct: 4, value: Math.round(price.value * 0.04) }]
  if (isOffPlan.value) {
    rows.push({ label: t('mortgage.cost.oqoodRegistration', 'Registro Oqood'), value: 3000 })
    rows.push({ label: t('mortgage.cost.trustee', 'Fideicomiso (trustee)'), value: 4500 })
  } else {
    rows.push({ label: t('mortgage.cost.dldRegistration', 'Registro DLD (título de propiedad)'), value: 4200 })
    rows.push({ label: t('mortgage.cost.titleDeedIssuance', 'Emisión del title deed'), value: 580 })
    rows.push({ label: t('mortgage.cost.agencyCommission', 'Comisión de agencia (+ IVA 5%)'), pct: 2.1, value: Math.round(price.value * 0.021) })
  }
  if (loan.value > 0) {
    rows.push({ label: t('mortgage.cost.mortgageRegistration', 'Registro de hipoteca'), value: Math.round(loan.value * 0.0025) + 290 })
  }
  return rows
})
const totalCosts = computed(() => costs.value.reduce((a, c) => a + c.value, 0))

const annualRent = computed(() => (props.rentalYield ? Math.round((price.value * props.rentalYield) / 100) : 0))
const rentalYield = computed(() => props.rentalYield)

const { format: money } = useCurrency()
</script>

<style scoped>
.filter-title {
  margin-bottom: 1rem;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #78716c;
}
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
  background: #065f46;
  cursor: pointer;
  border: 3px solid #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}
.range::-moz-range-thumb {
  height: 20px;
  width: 20px;
  border-radius: 9999px;
  background: #065f46;
  cursor: pointer;
  border: 3px solid #fff;
}
</style>
