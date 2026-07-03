<template>
  <div class="grid gap-8 lg:grid-cols-2">
    <!-- Mortgage -->
    <div>
      <h3 class="filter-title">Hipoteca</h3>
      <div class="space-y-5">
        <div>
          <div class="mb-1 flex justify-between text-sm">
            <span class="text-stone-500">Entrada</span>
            <span class="font-semibold">{{ downPct }}% · {{ money(downPayment) }}</span>
          </div>
          <input v-model.number="downPct" type="range" min="10" max="60" step="5" class="range" />
        </div>
        <div>
          <div class="mb-1 flex justify-between text-sm">
            <span class="text-stone-500">Interés anual</span>
            <span class="font-semibold">{{ rate }}%</span>
          </div>
          <input v-model.number="rate" type="range" min="1" max="8" step="0.1" class="range" />
        </div>
        <div>
          <div class="mb-1 flex justify-between text-sm">
            <span class="text-stone-500">Plazo</span>
            <span class="font-semibold">{{ years }} años</span>
          </div>
          <input v-model.number="years" type="range" min="5" max="35" step="1" class="range" />
        </div>
      </div>
      <div class="mt-6 rounded-2xl bg-ink p-6 text-white">
        <p class="text-[11px] uppercase tracking-widest2 text-white/60">Cuota mensual estimada</p>
        <p class="mt-1 font-serif text-4xl">{{ money(monthly) }}</p>
        <p class="mt-2 text-[13px] text-white/70">
          Financias {{ money(loan) }} · Total intereses {{ money(totalInterest) }}
        </p>
      </div>
    </div>

    <!-- Costs + rentability -->
    <div class="space-y-8">
      <div>
        <h3 class="filter-title">Costes de compra estimados</h3>
        <ul class="divide-y divide-line border-y border-line">
          <li v-for="c in costs" :key="c.label" class="flex items-center justify-between py-3 text-sm">
            <span class="text-stone-500">{{ c.label }}<span class="text-stone-400"> · {{ c.pct }}%</span></span>
            <span class="font-medium">{{ money(c.value) }}</span>
          </li>
          <li class="flex items-center justify-between py-3 text-sm font-semibold">
            <span>Total aproximado con gastos</span>
            <span>{{ money(price + totalCosts) }}</span>
          </li>
        </ul>
      </div>

      <div v-if="rentalYield">
        <h3 class="filter-title">Rentabilidad estimada</h3>
        <div class="grid grid-cols-3 gap-3 text-center">
          <div class="rounded-xl border border-line p-4">
            <p class="font-serif text-2xl">{{ rentalYield }}%</p>
            <p class="mt-1 text-[11px] uppercase tracking-widest text-stone-400">Bruta anual</p>
          </div>
          <div class="rounded-xl border border-line p-4">
            <p class="font-serif text-2xl">{{ money(annualRent) }}</p>
            <p class="mt-1 text-[11px] uppercase tracking-widest text-stone-400">Renta / año</p>
          </div>
          <div class="rounded-xl border border-line p-4">
            <p class="font-serif text-2xl">{{ money(Math.round(annualRent / 12)) }}</p>
            <p class="mt-1 text-[11px] uppercase tracking-widest text-stone-400">Renta / mes</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ price: number; rentalYield?: number | null }>()

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

const costs = computed(() => {
  const rows = [
    { label: 'Impuesto de transmisión', pct: 4, value: Math.round(price.value * 0.04) },
    { label: 'Notaría y registro', pct: 1.5, value: Math.round(price.value * 0.015) },
    { label: 'Honorarios agencia', pct: 2, value: Math.round(price.value * 0.02) },
  ]
  return rows
})
const totalCosts = computed(() => costs.value.reduce((a, c) => a + c.value, 0))

const annualRent = computed(() => (props.rentalYield ? Math.round((price.value * props.rentalYield) / 100) : 0))
const rentalYield = computed(() => props.rentalYield)

function money(v: number) {
  return `AED ${new Intl.NumberFormat('en-US').format(v || 0)}`
}
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
  outline: none;
}
.range::-webkit-slider-thumb {
  appearance: none;
  height: 20px;
  width: 20px;
  border-radius: 9999px;
  background: #16150f;
  cursor: pointer;
  border: 3px solid #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}
.range::-moz-range-thumb {
  height: 20px;
  width: 20px;
  border-radius: 9999px;
  background: #16150f;
  cursor: pointer;
  border: 3px solid #fff;
}
</style>
