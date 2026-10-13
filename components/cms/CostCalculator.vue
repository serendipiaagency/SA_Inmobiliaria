<template>
  <section class="cms-calc" data-testid="cms-cost-calculator" aria-labelledby="cms-calc-title">
    <div class="cms-calc-head">
      <p id="cms-calc-title" class="cms-calc-title">{{ block.title || 'Calculadora de gastos de compraventa' }}</p>
      <p class="cms-calc-intro">Una estimación orientativa de impuestos y gastos, con los tipos generales de cada comunidad. Las cifras de notaría, registro y gestoría son estimaciones; los tipos reducidos (jóvenes, familias numerosas, vivienda protegida, zonas rurales…) no se aplican.</p>
    </div>

    <form class="cms-calc-form" @submit.prevent>
      <div class="cms-calc-field">
        <label for="cms-calc-price">Precio de la vivienda</label>
        <div class="cms-calc-input">
          <input id="cms-calc-price" v-model.number="price" type="number" inputmode="numeric" min="10000" max="10000000" step="1000" data-testid="cms-calc-price">
          <span>€</span>
        </div>
      </div>
      <div class="cms-calc-field">
        <label for="cms-calc-region">Comunidad autónoma</label>
        <select id="cms-calc-region" v-model="region" data-testid="cms-calc-region">
          <option v-for="r in REGIONS" :key="r.code" :value="r.code">{{ r.name }}</option>
        </select>
      </div>
      <fieldset class="cms-calc-field cms-calc-kind">
        <legend>Tipo de vivienda</legend>
        <label><input v-model="kind" type="radio" value="used" data-testid="cms-calc-kind-used"> Segunda mano <small>(ITP)</small></label>
        <label><input v-model="kind" type="radio" value="new" data-testid="cms-calc-kind-new"> Obra nueva <small>(IVA/IGIC + AJD)</small></label>
      </fieldset>
      <label class="cms-calc-field cms-calc-check">
        <input v-model="mortgage" type="checkbox" data-testid="cms-calc-mortgage">
        <span>Con hipoteca (añade la tasación y la gestoría del préstamo)</span>
      </label>
    </form>

    <div v-if="result" class="cms-calc-result" data-testid="cms-calc-result">
      <div class="cms-calc-total">
        <span class="cms-calc-total-label">Impuestos y gastos estimados</span>
        <strong data-testid="cms-calc-total">{{ fmtEur(result.total) }}</strong>
        <span class="cms-calc-total-pct">{{ fmtPct(result.pctOfPrice) }} del precio · coste total aproximado {{ fmtEur(price + result.total) }}</span>
      </div>
      <div class="cms-calc-bars" role="img" :aria-label="`Reparto: impuestos ${fmtEur(result.taxes)}, gastos ${fmtEur(result.fees)}`">
        <div class="cms-calc-bar">
          <i class="is-tax" :style="{ width: `${share(result.taxes)}%` }" />
          <i class="is-fee" :style="{ width: `${share(result.fees)}%` }" />
        </div>
        <ul class="cms-calc-legend">
          <li><i class="is-tax" />Impuestos {{ fmtEur(result.taxes) }}</li>
          <li><i class="is-fee" />Gastos {{ fmtEur(result.fees) }}</li>
        </ul>
      </div>
      <div class="cms-calc-table-wrap">
      <table class="cms-calc-table">
        <thead>
          <tr><th scope="col">Concepto</th><th scope="col">Importe</th><th scope="col">Cómo se calcula</th></tr>
        </thead>
        <tbody>
          <tr v-for="line in result.lines" :key="line.key" :data-testid="`cms-calc-line-${line.key}`">
            <td>{{ line.label }}<span v-if="line.estimate" class="cms-calc-est">estimación</span></td>
            <td class="cms-calc-amount">{{ fmtEur(line.amount) }}</td>
            <td class="cms-calc-how">{{ line.how }}</td>
          </tr>
        </tbody>
      </table>
      </div>
      <p class="cms-calc-source" :class="result.region.verified === 'official' ? 'is-official' : 'is-pending'" data-testid="cms-calc-source" :data-verified="result.region.verified">
        <strong>{{ result.region.verified === 'official' ? 'Tipos contrastados con fuente oficial' : 'Pendiente de revisión editorial' }}</strong>
        <span> · parámetros revisados el {{ reviewedLabel }}.</span>
        <span> {{ result.region.source }}</span>
        <span v-if="result.region.notes"> {{ result.region.notes }}</span>
      </p>
      <p class="cms-calc-disclaimer">Hipótesis: comprador particular, vivienda sin bonificaciones, precio igual al valor de referencia o superior (si el valor de referencia de Catastro es mayor que el precio, el impuesto se calcula sobre el valor de referencia). Desde 2019 los gastos del préstamo hipotecario (notaría, registro, gestoría y AJD del préstamo) los paga el banco; la tasación la paga quien compra. Esto no es asesoramiento fiscal.</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { REGIONS, REVIEWED_AT, computePurchaseCosts, fmtEur, fmtPct } from '~/utils/compraGastos'

/**
 * Calculadora de gastos de compraventa (bloque `cost_calculator`): precio,
 * comunidad y tipo de vivienda → ITP o IVA/IGIC + AJD, notaría, registro,
 * gestoría y, con hipoteca, tasación. Toda la lógica y los parámetros viven
 * en utils/compraGastos.ts, con su fecha de revisión y su fuente.
 */
const props = defineProps<{ block: { title?: string; defaultPrice?: number; defaultRegion?: string } }>()
const price = ref(Number(props.block.defaultPrice) || 200000)
const region = ref(props.block.defaultRegion || 'AST')
const kind = ref<'new' | 'used'>('used')
const mortgage = ref(true)
const result = computed(() => computePurchaseCosts({ price: price.value, region: region.value, kind: kind.value, mortgage: mortgage.value }))
const share = (n: number) => (result.value && result.value.total ? Math.round((n / result.value.total) * 100) : 0)
const reviewedLabel = computed(() => {
  const [y, m, d] = REVIEWED_AT.split('-')
  return `${d}/${m}/${y}`
})
</script>

<style scoped>
.cms-calc {
  margin: 3rem 0;
  padding: 2rem;
  border-radius: 1.25rem;
  border: 1px solid var(--cms-line, #e6e1d7);
  background: #fff;
}
.cms-calc-title {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: -0.015em;
}
.cms-calc-intro {
  margin: 0.5rem 0 0;
  font-size: 0.92rem;
  line-height: 1.5;
  color: #4f5b53;
  max-width: 64ch;
}
.cms-calc-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem 1.5rem;
  margin-top: 1.5rem;
}
.cms-calc-field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 0;
  border: 0;
  padding: 0;
  margin: 0;
}
.cms-calc-field > label,
.cms-calc-field > legend {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #4f5b53;
}
.cms-calc-input {
  display: flex;
  align-items: center;
  border: 1px solid var(--cms-line, #e6e1d7);
  border-radius: 0.75rem;
  background: #fff;
  overflow: hidden;
}
.cms-calc-input input {
  flex: 1;
  min-width: 0;
  border: 0;
  padding: 0.7rem 0.9rem;
  font-size: 1.05rem;
  font-variant-numeric: tabular-nums;
  background: transparent;
}
.cms-calc-input span {
  padding: 0 0.9rem;
  color: #7a857a;
}
.cms-calc-field select {
  border: 1px solid var(--cms-line, #e6e1d7);
  border-radius: 0.75rem;
  padding: 0.7rem 0.9rem;
  font-size: 1rem;
  background: #fff;
}
.cms-calc-kind label,
.cms-calc-check {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.95rem;
  cursor: pointer;
}
.cms-calc-kind label small {
  color: #7a857a;
}
.cms-calc-kind input,
.cms-calc-check input {
  accent-color: var(--cms-accent, #1f4e5f);
  width: 1rem;
  height: 1rem;
}
.cms-calc-check {
  flex-direction: row;
  align-self: end;
  padding-bottom: 0.4rem;
}
.cms-calc-result {
  margin-top: 1.75rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--cms-line, #e6e1d7);
}
.cms-calc-total {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.cms-calc-total-label {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #4f5b53;
}
.cms-calc-total strong {
  font-size: 2.2rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--cms-accent, #1f4e5f);
  font-variant-numeric: tabular-nums;
}
.cms-calc-total-pct {
  font-size: 0.9rem;
  color: #4f5b53;
}
.cms-calc-bars {
  margin-top: 1rem;
}
.cms-calc-bar {
  display: flex;
  height: 12px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--cms-paper-2, #f6f4ef);
}
.cms-calc-bar i,
.cms-calc-legend i {
  display: inline-block;
}
.cms-calc-bar i {
  height: 100%;
  transition: width 0.3s ease;
}
.is-tax {
  background: var(--cms-accent, #1f4e5f);
}
.is-fee {
  background: #c9a66b;
}
.cms-calc-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.25rem;
  margin: 0.6rem 0 0;
  padding: 0;
  list-style: none;
  font-size: 0.85rem;
  color: #4f5b53;
}
.cms-calc-legend i {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 3px;
  margin-right: 0.4rem;
  vertical-align: -1px;
}
.cms-calc-table {
  width: 100%;
  margin-top: 1.25rem;
  border-collapse: collapse;
  font-size: 0.92rem;
}
.cms-calc-table th {
  text-align: left;
  font-size: 0.72rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #7a857a;
  padding: 0.5rem 0.5rem 0.5rem 0;
  border-bottom: 1px solid var(--cms-line, #e6e1d7);
}
.cms-calc-table td {
  padding: 0.65rem 0.5rem 0.65rem 0;
  border-bottom: 1px solid #efebe3;
  vertical-align: top;
}
.cms-calc-amount {
  white-space: nowrap;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.cms-calc-how {
  color: #6b766d;
  font-size: 0.85rem;
}
.cms-calc-est {
  display: inline-block;
  margin-left: 0.4rem;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  background: var(--cms-paper-2, #f6f4ef);
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #7a857a;
}
.cms-calc-source {
  margin: 1.25rem 0 0;
  padding: 0.9rem 1rem;
  border-radius: 0.8rem;
  font-size: 0.85rem;
  line-height: 1.5;
}
.cms-calc-source.is-official {
  background: #eef4ef;
  color: #22503a;
}
.cms-calc-source.is-pending {
  background: #fdf3e2;
  color: #7a4e12;
}
.cms-calc-disclaimer {
  margin: 0.9rem 0 0;
  font-size: 0.8rem;
  line-height: 1.5;
  color: #7a857a;
}
@media (max-width: 639px) {
  .cms-calc {
    padding: 1.25rem;
  }
  .cms-calc-form {
    grid-template-columns: minmax(0, 1fr);
  }
  .cms-calc-table thead {
    display: none;
  }
  .cms-calc-table tr {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    padding: 0.5rem 0;
    border-bottom: 1px solid #efebe3;
  }
  .cms-calc-table td {
    border: 0;
    padding: 0.15rem 0;
  }
  .cms-calc-how {
    grid-column: 1 / -1;
  }
}
.cms-calc-table-wrap {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
</style>
