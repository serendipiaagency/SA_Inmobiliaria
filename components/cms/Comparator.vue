<template>
  <section class="cms-compare" data-testid="cms-comparator">
    <p v-if="block.title" class="cms-compare-title">{{ block.title }}</p>
    <div class="cms-compare-table-wrap">
      <table class="cms-compare-table">
        <thead>
          <tr>
            <th scope="col">Criterio</th>
            <th scope="col">{{ block.labelA || 'Obra nueva' }}</th>
            <th scope="col">{{ block.labelB || 'Segunda mano' }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in block.rows || []" :key="i">
            <th scope="row">{{ row.label }}</th>
            <td>{{ row.a }}</td>
            <td>{{ row.b }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="block.questions?.length" class="cms-compare-quiz" data-testid="cms-comparator-quiz">
      <p class="cms-compare-quiz-title">{{ block.quizTitle || '¿Qué te encaja mejor?' }}</p>
      <p class="cms-compare-quiz-intro">Marca lo que más pesa para ti. No es una recomendación: es una forma de ordenar tus prioridades.</p>
      <ol class="cms-compare-questions">
        <li v-for="(q, qi) in block.questions" :key="qi">
          <p class="cms-compare-q">{{ q.q }}</p>
          <div class="cms-compare-options" role="group" :aria-label="q.q">
            <label v-for="(opt, oi) in q.options" :key="oi" :class="{ 'is-selected': answers[qi] === oi }">
              <input v-model="answers[qi]" type="radio" :name="`cms-compare-${qi}`" :value="oi" :data-testid="`cms-comparator-q${qi + 1}-o${oi + 1}`">
              <span>{{ opt.label }}</span>
            </label>
          </div>
        </li>
      </ol>
      <div class="cms-compare-verdict" role="status" aria-live="polite" data-testid="cms-comparator-verdict" :data-lean="lean">
        <template v-if="answered === 0">Responde a las preguntas para ver hacia dónde se inclinan tus prioridades.</template>
        <template v-else>
          <strong v-if="lean === 'a'">Tus prioridades se inclinan hacia {{ (block.labelA || 'obra nueva').toLowerCase() }}</strong>
          <strong v-else-if="lean === 'b'">Tus prioridades se inclinan hacia {{ (block.labelB || 'segunda mano').toLowerCase() }}</strong>
          <strong v-else>Tus prioridades están repartidas</strong>
          <span> · {{ scoreA }} a favor de {{ (block.labelA || 'obra nueva').toLowerCase() }}, {{ scoreB }} de {{ (block.labelB || 'segunda mano').toLowerCase() }} ({{ answered }} de {{ block.questions.length }} respondidas).</span>
          <button type="button" class="cms-btn-ghost cms-compare-reset" data-testid="cms-comparator-reset" @click="answers = {}">Borrar respuestas</button>
        </template>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * Comparador: tabla responsive de criterios y un cuestionario de prioridades
 * que cuenta hacia qué alternativa apuntan las respuestas. No guarda nada.
 */
const props = defineProps<{ block: { title?: string; labelA?: string; labelB?: string; rows?: Array<{ label: string; a: string; b: string }>; quizTitle?: string; questions?: Array<{ q: string; options: Array<{ label: string; favors: 'a' | 'b' | 'none' }> }> } }>()
const answers = ref<Record<number, number>>({})
const answered = computed(() => Object.keys(answers.value).length)
const scoreA = computed(() => count('a'))
const scoreB = computed(() => count('b'))
const lean = computed(() => (scoreA.value > scoreB.value ? 'a' : scoreB.value > scoreA.value ? 'b' : 'even'))
function count(side: 'a' | 'b') {
  let n = 0
  for (const [qi, oi] of Object.entries(answers.value)) {
    const opt = props.block.questions?.[Number(qi)]?.options?.[oi]
    if (opt?.favors === side) n++
  }
  return n
}
</script>

<style scoped>
.cms-compare {
  margin: 3rem 0;
}
.cms-compare-title {
  margin: 0 0 1rem;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--cms-accent, #1f4e5f);
}
.cms-compare-table-wrap {
  overflow-x: auto;
  border-radius: 1rem;
  border: 1px solid var(--cms-line, #e6e1d7);
}
.cms-compare-table {
  width: 100%;
  min-width: 560px;
  border-collapse: collapse;
  font-size: 0.93rem;
}
.cms-compare-table thead th {
  padding: 0.9rem 1rem;
  text-align: left;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  background: var(--cms-paper-2, #f6f4ef);
  color: #4f5b53;
}
.cms-compare-table tbody th {
  text-align: left;
  font-weight: 600;
  color: #2b2a26;
  width: 24%;
}
.cms-compare-table td,
.cms-compare-table tbody th {
  padding: 0.85rem 1rem;
  border-top: 1px solid var(--cms-line, #e6e1d7);
  vertical-align: top;
  line-height: 1.5;
}
.cms-compare-table tbody tr:nth-child(even) {
  background: #fcfbf8;
}
.cms-compare-quiz {
  margin-top: 2rem;
  padding: 1.75rem 2rem;
  border-radius: 1.25rem;
  background: var(--cms-paper-2, #f6f4ef);
}
.cms-compare-quiz-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: -0.015em;
}
.cms-compare-quiz-intro {
  margin: 0.35rem 0 0;
  font-size: 0.9rem;
  color: #4f5b53;
}
.cms-compare-questions {
  margin: 1.25rem 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 1.1rem;
}
.cms-compare-q {
  margin: 0 0 0.5rem;
  font-weight: 600;
}
.cms-compare-options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.cms-compare-options label {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.9rem;
  border-radius: 999px;
  border: 1px solid var(--cms-line, #e6e1d7);
  background: #fff;
  font-size: 0.9rem;
  cursor: pointer;
  transition: border-color 0.2s, background-color 0.2s, color 0.2s;
}
.cms-compare-options label.is-selected {
  background: var(--cms-accent, #1f4e5f);
  border-color: var(--cms-accent, #1f4e5f);
  color: #fff;
}
.cms-compare-options input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}
.cms-compare-options label:focus-within {
  outline: 2px solid var(--cms-accent, #1f4e5f);
  outline-offset: 2px;
}
.cms-compare-verdict {
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid #e4dfd4;
  font-size: 0.95rem;
  line-height: 1.5;
  color: #2b2a26;
}
.cms-compare-reset {
  display: inline-block;
  margin-top: 0.75rem;
}
@media (max-width: 639px) {
  .cms-compare-quiz {
    padding: 1.25rem;
  }
}
</style>
