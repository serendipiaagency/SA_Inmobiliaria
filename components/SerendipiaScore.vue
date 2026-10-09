<template>
  <div v-if="state.loading" class="skeleton h-44 rounded-[14px]" />
  <div v-else-if="score && score.overall != null" class="pcard" data-testid="serendipia-score">
    <h2 class="pcard-title">{{ t('serendipiaScore.eyebrow', 'Serendipia Score') }}</h2>
    <div class="mt-4 grid grid-cols-1 items-center gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,300px)] xl:gap-8">
      <div class="flex flex-wrap items-center gap-x-5 gap-y-4">
        <div class="relative flex h-[92px] w-[92px] shrink-0 items-center justify-center rounded-full" :style="{ background: `conic-gradient(#e8792b ${score.overall * 3.6}deg, #f3e6da 0deg)` }" aria-hidden="true">
          <div class="flex h-[70px] w-[70px] items-center justify-center rounded-full bg-white">
            <span class="text-[28px] font-bold text-ink">{{ score.overall }}</span>
          </div>
        </div>
        <div class="min-w-[180px] flex-1">
          <span class="eyebrow whitespace-nowrap">{{ t('serendipiaScore.eyebrow', 'Serendipia Score') }}</span>
          <p class="mt-2 text-[22px] font-bold leading-tight text-ink" data-testid="serendipia-score-label">
            <span class="sr-only">{{ score.overall }}/100 — </span>{{ qualityLabel(score.overall) }}
          </p>
          <p v-if="summary" class="mt-1 text-[12.5px] leading-relaxed text-stone-500" data-testid="serendipia-score-summary">{{ summary }}</p>
        </div>
        <button type="button" class="peach-btn" :aria-expanded="open" data-testid="serendipia-score-more" @click="open = !open">
          {{ open ? t('serendipiaScore.less', 'Ocultar análisis') : t('serendipiaScore.more', 'Ver análisis completo') }}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" :class="{ 'rotate-90': open }" class="transition"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </button>
      </div>
      <ul class="space-y-3.5" data-testid="serendipia-score-bars">
        <li v-for="b in bars" :key="b.key" :data-factor="b.key">
          <div class="flex items-baseline justify-between gap-3 text-[12.5px]">
            <span class="font-medium text-ink">{{ b.label }}</span>
            <span class="shrink-0 text-stone-400">{{ b.score }}/100</span>
          </div>
          <div class="mt-1.5 h-[5px] overflow-hidden rounded-full bg-[#f3eee8]">
            <div class="h-full rounded-full bg-[#e8792b]" :style="{ width: `${b.score}%` }" />
          </div>
        </li>
      </ul>
    </div>
    <!-- El análisis completo: de qué dato sale cada factor. Nada es una caja negra. -->
    <div v-if="open" class="mt-5 rounded-xl bg-[#faf7f2] p-4" data-testid="serendipia-score-detail">
      <p class="text-[12.5px] text-stone-500">{{ t('serendipiaScore.description', 'Índice propio calculado de forma transparente a partir de datos reales — no es una caja negra.') }}</p>
      <dl class="mt-3 space-y-2.5">
        <div v-for="b in factors" :key="b.key" :data-factor="b.key">
          <dt class="text-[13px] font-semibold text-ink">{{ b.label }} · {{ b.score }}/100</dt>
          <dd class="text-[12.5px] text-stone-500">{{ b.detail }}</dd>
        </div>
      </dl>
    </div>
  </div>
  <p v-else class="pcard text-sm text-stone-500">{{ t('serendipiaScore.empty', 'No hay suficientes datos de esta propiedad para calcular el Serendipia Score.') }}</p>
</template>

<script setup lang="ts">
/**
 * Serendipia Score de la ficha (#111): el índice real de server/utils/score.ts
 * — anillo con la nota, su etiqueta, un resumen hecho con los propios
 * factores (el más fuerte y el más flojo) y las barras de cada uno. «Ver
 * análisis completo» enseña de qué dato sale cada factor. Un factor sin dato
 * no sale (el servidor no lo inventa); sin ninguno, no hay nota. Etiqueta y
 * explicación se componen en el idioma de la web (useScoreText).
 */
import type { ScoreTextItem } from '~/composables/useScoreText'

const props = defineProps<{ slug: string }>()
const { t, locale, intlLocale } = useI18n()
const text = useScoreText()

interface Factor extends ScoreTextItem {
  score: number
}
const state = usePropertyInsight<{ overall: number | null; breakdown: Factor[] }>(props.slug, 'score')
const score = computed(() => state.value.data)
const factors = computed(() => (score.value?.breakdown || []).map((b) => ({ ...b, ...text.factor(b) })))
const bars = computed(() => factors.value.slice(0, 4))
const open = ref(false)

function qualityLabel(n: number) {
  if (n >= 85) return t('serendipiaScore.quality.excellent', 'Excelente')
  if (n >= 70) return t('serendipiaScore.quality.veryGood', 'Muy buena')
  if (n >= 55) return t('serendipiaScore.quality.good', 'Buena')
  if (n >= 40) return t('serendipiaScore.quality.acceptable', 'Aceptable')
  return t('serendipiaScore.quality.improvable', 'Mejorable')
}

// En mitad de la frase, la etiqueta va en minúscula; en alemán no, que los sustantivos van en mayúscula.
const lower = (s: string) => (locale.value === 'de' ? s : s.charAt(0).toLocaleLowerCase(intlLocale.value) + s.slice(1))
const summary = computed(() => {
  const list = [...factors.value].sort((a, b) => b.score - a.score)
  if (!list.length) return ''
  const best = list[0]
  const worst = list[list.length - 1]
  if (list.length === 1 || best.score === worst.score) return `${t('serendipiaScore.summaryOnly', 'Valorado por')} ${lower(best.label)}.`
  return `${t('serendipiaScore.summaryBest', 'Destaca en')} ${lower(best.label)}; ${t('serendipiaScore.summaryWorst', 'lo más mejorable')}: ${lower(worst.label)}.`
})
</script>

<style scoped>
.peach-btn {
  display: inline-flex;
  height: 38px;
  align-items: center;
  gap: 8px;
  border-radius: 9999px;
  background: #fdf1e7;
  padding: 0 18px;
  font-size: 13px;
  font-weight: 600;
  color: #b4572a;
  transition: background 0.15s;
}
.peach-btn:hover {
  background: #fbe6d5;
}
.peach-btn:focus-visible {
  outline: 2px solid #b4572a;
  outline-offset: 2px;
}
</style>
