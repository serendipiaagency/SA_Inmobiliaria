<template>
  <div class="rounded-2xl border border-line bg-white p-6 sm:p-8">
    <div class="flex items-center gap-2">
      <span class="rounded-full bg-ink px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest2 text-white">{{ t('aiAnalysis.badge', 'IA') }}</span>
      <p class="eyebrow !text-stone-450">{{ t('aiAnalysis.eyebrow', 'Análisis de inversión') }}</p>
    </div>

    <div v-if="loading" class="mt-6 space-y-3">
      <div class="skeleton h-4 w-full rounded" />
      <div class="skeleton h-4 w-11/12 rounded" />
      <div class="skeleton h-4 w-3/4 rounded" />
    </div>

    <template v-else-if="data">
      <div v-if="hasComparison" class="mt-6 grid gap-4 sm:grid-cols-2">
        <div v-if="pricePerM2 && data.market.avgPricePerM2" class="rounded-xl bg-paper p-5">
          <p class="text-[11px] font-semibold uppercase tracking-widest text-stone-450">{{ t('aiAnalysis.pricePerM2', 'Precio / m²') }}</p>
          <div class="mt-2 flex items-baseline gap-2">
            <span class="text-xl font-semibold">{{ formatPrice(Math.round(pricePerM2)) }}</span>
            <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="priceDelta <= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'">
              {{ priceDelta > 0 ? '+' : '' }}{{ priceDelta }}% {{ t('aiAnalysis.vsArea', 'vs. zona') }}
            </span>
          </div>
          <p class="mt-1 text-[12px] text-stone-400">{{ t('aiAnalysis.averageOf', 'Media de') }} {{ comparablesLabel }}: {{ formatPrice(Math.round(data.market.avgPricePerM2)) }}</p>
        </div>
        <div v-if="props.rentalYield && data.market.avgRentalYield" class="rounded-xl bg-paper p-5">
          <p class="text-[11px] font-semibold uppercase tracking-widest text-stone-450">{{ t('aiAnalysis.profitability', 'Rentabilidad') }}</p>
          <div class="mt-2 flex items-baseline gap-2">
            <span class="text-xl font-semibold">{{ props.rentalYield }}%</span>
            <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="yieldDelta >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'">
              {{ yieldDelta > 0 ? '+' : '' }}{{ yieldDelta }} {{ t('aiAnalysis.ptsVsArea', 'pts vs. zona') }}
            </span>
          </div>
          <p class="mt-1 text-[12px] text-stone-400">{{ t('aiAnalysis.averageOf', 'Media de') }} {{ comparablesLabel }}: {{ data.market.avgRentalYield.toFixed(1) }}%</p>
        </div>
      </div>

      <p class="mt-6 max-w-3xl text-[15px] leading-[1.9] text-stone-600">{{ data.text }}</p>
      <p class="mt-4 text-[11px] uppercase tracking-widest text-stone-400">
        {{ data.engine === 'ai' ? t('aiAnalysis.generatedByAi', 'Análisis generado por IA') : t('aiAnalysis.dataBasedGuidance', 'Análisis orientativo basado en datos · confírmalo con un asesor') }}
      </p>
    </template>

    <p v-else class="mt-6 text-sm text-stone-500">{{ t('aiAnalysis.failed', 'No se ha podido generar el análisis ahora mismo.') }}</p>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ slug: string; price?: number | null; area?: number | null; rentalYield?: number | null }>()
const { format: formatPrice } = useCurrency()
const { t } = useI18n()

const loading = ref(true)
const data = ref<{ text: string; engine: 'ai' | 'rules'; market: { comparableCount: number; avgPricePerM2: number | null; avgRentalYield: number | null } } | null>(null)

const pricePerM2 = computed(() => (props.price && props.area ? props.price / props.area : null))
const hasComparison = computed(() => !!data.value && data.value.market.comparableCount > 0)
const priceDelta = computed(() => {
  if (!pricePerM2.value || !data.value?.market.avgPricePerM2) return 0
  return Math.round(((pricePerM2.value - data.value.market.avgPricePerM2) / data.value.market.avgPricePerM2) * 100)
})
const yieldDelta = computed(() => {
  if (!props.rentalYield || !data.value?.market.avgRentalYield) return 0
  return Math.round((props.rentalYield - data.value.market.avgRentalYield) * 10) / 10
})
const comparablesLabel = computed(() => {
  const n = data.value?.market.comparableCount ?? 0
  return n === 1 ? t('aiAnalysis.comparableSingular', '1 comparable') : `${n} ${t('aiAnalysis.comparablePlural', 'comparables')}`
})

onMounted(async () => {
  try {
    data.value = await $fetch<any>(`/api/public/properties/${props.slug}/analysis`)
  } catch {
    data.value = null
  } finally {
    loading.value = false
  }
})
</script>
