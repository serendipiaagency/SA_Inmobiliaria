<template>
  <section v-if="rows.length" class="pcard !bg-[#fdf8f1]" data-testid="ficha-quick-decision">
    <div class="flex items-center gap-3">
      <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fbe6d5] text-[#b4572a]" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="m9.5 14.5 1.8 1.8 3.4-3.6" /></svg>
      </span>
      <h2 class="pcard-title">{{ t('decisionPanel.decision.eyebrow', 'Decisión rápida') }}</h2>
    </div>
    <p class="mt-3 text-[12.5px] leading-relaxed text-stone-500">{{ t('ficha.decisionSubtitle', 'Cada valoración se calcula a partir de datos reales de la propiedad y del mercado actual.') }}</p>
    <ul class="mt-4 divide-y divide-[#f0e8dc]">
      <li v-for="d in rows" :key="d.key" class="flex items-center justify-between gap-3 py-3.5" :data-decision="d.key">
        <span class="text-[14px] font-medium text-ink">{{ d.label }}</span>
        <span class="flex items-center gap-0.5" role="img" :aria-label="`${d.stars} ${t('ficha.of5', 'de 5')}`">
          <svg v-for="i in 5" :key="i" class="h-4 w-4" :class="i <= d.stars ? 'text-[#f29a38]' : 'text-[#e8e1d6]'" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.2 6.8.7-5.1 4.6 1.5 6.7L12 17.2l-6.1 3.5 1.5-6.7-5.1-4.6 6.8-.7z" /></svg>
        </span>
      </li>
    </ul>
    <!-- La metodología de cada valoración: el dato real del que sale. -->
    <details class="mt-2 text-[12.5px] text-stone-500" data-testid="ficha-quick-decision-method">
      <summary class="cursor-pointer select-none font-medium text-stone-600 hover:text-ink">{{ t('ficha.howCalculated', 'Cómo se calcula') }}</summary>
      <dl class="mt-2 space-y-2">
        <div v-for="d in rows" :key="d.key">
          <dt class="font-semibold text-ink">{{ d.label }}</dt>
          <dd>{{ d.detail }}</dd>
        </div>
      </dl>
    </details>
  </section>
</template>

<script setup lang="ts">
/**
 * DECISIÓN RÁPIDA de la ficha (#111): Comprar, Inversión, Revalorización y
 * Liquidez en estrellas, del motor real de server/utils/score.ts
 * (computeDecisionScores): cada una sale de datos de la propiedad y de sus
 * comparables, y dice de cuáles en «Cómo se calcula». Una valoración sin dato
 * no sale; sin ninguna, la tarjeta tampoco.
 */
const props = defineProps<{ slug: string }>()
const { t } = useI18n()

const KEYS = ['comprar', 'inversion', 'revalorizacion', 'liquidez']
const state = usePropertyInsight<{ decision?: { key: string; label: string; stars: number | null; detail: string }[] }>(props.slug, 'score')
const rows = computed(() =>
  (state.value.data?.decision || [])
    .filter((d): d is { key: string; label: string; stars: number; detail: string } => KEYS.includes(d.key) && typeof d.stars === 'number')
    .sort((a, b) => KEYS.indexOf(a.key) - KEYS.indexOf(b.key)),
)
</script>
