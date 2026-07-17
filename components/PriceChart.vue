<template>
  <div class="rounded-2xl border border-emerald-100 bg-emerald-50/30 p-6 sm:p-8">
    <div v-if="loading" class="skeleton h-[200px] w-full rounded-xl" />
    <template v-else-if="points.length >= 2">
      <div class="mb-5 flex items-baseline justify-between">
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-widest text-stone-450">{{ t('priceChart.currentPrice', 'Precio actual') }}</p>
          <p class="mt-1 text-2xl font-semibold">{{ formatPrice(points[points.length - 1].price) }}</p>
        </div>
        <span v-if="changePct" class="rounded-full px-2.5 py-1 text-[11px] font-semibold" :class="changePct < 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'">
          {{ changePct > 0 ? '+' : '' }}{{ changePct }}% {{ t('priceChart.sincePreviousRecord', 'desde el registro anterior') }}
        </span>
      </div>
      <AdminAreaChart :values="points.map((p) => p.price)" :labels="points.map((p) => dateLabel(p.recordedAt))" :h="200" :format="(v) => formatPrice(v)" />
    </template>
    <p v-else class="text-sm text-stone-500">{{ t('priceChart.empty', 'Aún no hay suficientes registros de precio para mostrar una tendencia. El histórico se irá completando con cada actualización real del precio.') }}</p>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ slug: string }>()
const { format: formatPrice } = useCurrency()
const { t } = useI18n()

const loading = ref(true)
const points = ref<{ price: number; recordedAt: string }[]>([])

const changePct = computed(() => {
  if (points.value.length < 2) return 0
  const prev = points.value[points.value.length - 2].price
  const last = points.value[points.value.length - 1].price
  if (!prev) return 0
  return Math.round(((last - prev) / prev) * 100)
})

function dateLabel(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

onMounted(async () => {
  try {
    const res = await $fetch<any>(`/api/public/properties/${props.slug}/price-history`)
    points.value = res.history || []
  } catch {
    points.value = []
  } finally {
    loading.value = false
  }
})
</script>
