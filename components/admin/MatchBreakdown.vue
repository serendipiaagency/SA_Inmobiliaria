<!--
  El desglose de un match, tal y como lo devuelve el motor.

  No reinterpreta nada ni vuelve a calcular: enseña exactamente los criterios
  que produjo `evaluateMatch()`. Si la pantalla dedujera por su cuenta por qué
  un inmueble encaja, la explicación de la interfaz y la del servidor podrían
  decir cosas distintas sobre el mismo match.
-->
<template>
  <div>
    <div class="flex flex-wrap items-center gap-2">
      <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="scoreClass">
        {{ result.score == null ? 'Sin criterios' : `${result.score} %` }}
      </span>
      <span v-if="result.eligibility !== 'eligible'" class="rounded-full px-2 py-0.5 text-[11px] font-medium" :class="eligibilityClass">
        {{ eligibilityLabel }}
      </span>
      <span v-if="result.confidence < 1" class="text-[11px] text-stone-400">
        faltan datos en {{ unknownCount }} {{ unknownCount === 1 ? 'criterio' : 'criterios' }}
      </span>
    </div>

    <ul class="mt-2 space-y-1 text-xs">
      <li v-for="c in result.criteria" :key="c.key" class="flex gap-2" :class="lineClass(c.outcome)">
        <span class="w-3 shrink-0 font-semibold">{{ symbol(c.outcome) }}</span>
        <span>
          <span class="font-medium">{{ c.label }}:</span>
          {{ c.detail }}
          <span v-if="c.importance === 'required'" class="text-stone-400">(imprescindible)</span>
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
interface CriterionOutcome {
  key: string
  label: string
  outcome: 'matched' | 'partial' | 'failed' | 'unknown'
  importance: string
  detail: string
}
interface MatchResult {
  eligibility: 'eligible' | 'ineligible' | 'needs_review'
  score: number | null
  confidence: number
  criteria: CriterionOutcome[]
}

const props = defineProps<{ result: MatchResult }>()

const unknownCount = computed(() => props.result.criteria.filter((c) => c.outcome === 'unknown').length)

const scoreClass = computed(() => {
  const score = props.result.score
  if (score == null) return 'bg-stone-100 text-stone-500'
  if (score >= 80) return 'bg-emerald-50 text-emerald-700'
  if (score >= 50) return 'bg-amber-50 text-amber-700'
  return 'bg-stone-100 text-stone-600'
})

const eligibilityLabel = computed(() =>
  props.result.eligibility === 'ineligible' ? 'Descartado por un imprescindible' : 'Revisar: falta un imprescindible por comprobar',
)
const eligibilityClass = computed(() =>
  props.result.eligibility === 'ineligible' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700',
)

function symbol(outcome: CriterionOutcome['outcome']) {
  return outcome === 'matched' ? '✓' : outcome === 'partial' ? '△' : outcome === 'failed' ? '✕' : '?'
}
function lineClass(outcome: CriterionOutcome['outcome']) {
  if (outcome === 'matched') return 'text-emerald-700'
  if (outcome === 'partial') return 'text-amber-700'
  if (outcome === 'failed') return 'text-rose-700'
  return 'text-stone-400'
}
</script>
