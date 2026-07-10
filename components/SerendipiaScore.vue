<template>
  <div v-if="loading" class="skeleton h-40 rounded-2xl" />
  <div v-else-if="data && data.overall != null" class="rounded-2xl border border-line bg-white p-6 sm:p-8">
    <div class="flex items-center gap-5">
      <div class="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full" :style="{ background: `conic-gradient(#16150f ${data.overall * 3.6}deg, #e7e4de 0deg)` }">
        <div class="flex h-[62px] w-[62px] items-center justify-center rounded-full bg-white">
          <span class="font-serif text-2xl">{{ data.overall }}</span>
        </div>
      </div>
      <div>
        <p class="eyebrow">{{ t('serendipiaScore.eyebrow', 'Serendipia Score') }}</p>
        <p class="mt-1 font-serif text-2xl">{{ qualityLabel(data.overall) }}</p>
        <p class="mt-1 text-[12px] text-stone-450">{{ t('serendipiaScore.description', 'Índice propio calculado de forma transparente a partir de datos reales — no es una caja negra.') }}</p>
      </div>
    </div>

    <div class="mt-6 space-y-4">
      <div v-for="b in data.breakdown" :key="b.key">
        <div class="mb-1.5 flex items-baseline justify-between text-sm">
          <span class="font-medium">{{ b.label }}</span>
          <span class="text-stone-450">{{ b.score }}/100</span>
        </div>
        <div class="h-1.5 overflow-hidden rounded-full bg-paper">
          <div class="h-full rounded-full bg-ink transition-all duration-500" :style="{ width: b.score + '%' }" />
        </div>
        <p class="mt-1 text-[12px] text-stone-450">{{ b.detail }}</p>
      </div>
    </div>
  </div>
  <p v-else class="text-sm text-stone-500">{{ t('serendipiaScore.empty', 'No hay suficientes datos de esta propiedad para calcular el Serendipia Score.') }}</p>
</template>

<script setup lang="ts">
const props = defineProps<{ slug: string }>()
const { t } = useI18n()

const loading = ref(true)
const data = ref<{ overall: number | null; breakdown: { key: string; label: string; score: number; detail: string }[] } | null>(null)

function qualityLabel(score: number) {
  if (score >= 85) return t('serendipiaScore.quality.excellent', 'Excelente')
  if (score >= 70) return t('serendipiaScore.quality.veryGood', 'Muy buena')
  if (score >= 55) return t('serendipiaScore.quality.good', 'Buena')
  if (score >= 40) return t('serendipiaScore.quality.acceptable', 'Aceptable')
  return t('serendipiaScore.quality.improvable', 'Mejorable')
}

onMounted(async () => {
  try {
    data.value = await $fetch<any>(`/api/public/properties/${props.slug}/score`)
  } catch {
    data.value = null
  } finally {
    loading.value = false
  }
})
</script>
