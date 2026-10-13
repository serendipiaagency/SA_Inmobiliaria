<template>
  <figure class="cms-factors" data-testid="cms-factors-chart">
    <figcaption class="cms-factors-head">
      <p class="cms-factors-title">{{ block.title || 'Qué mueve el precio' }}</p>
      <p v-if="block.text" class="cms-factors-text">{{ block.text }}</p>
    </figcaption>
    <div class="cms-factors-base">
      <span>Punto de partida (ejemplo ilustrativo)</span>
      <strong>{{ fmtEur(block.base || 0) }}</strong>
    </div>
    <ol class="cms-factors-list" :aria-label="block.title || 'Factores'">
      <li v-for="(f, i) in factors" :key="i" :data-testid="`cms-factor-${i + 1}`">
        <div class="cms-factors-label">
          <span>{{ f.label }}</span>
          <strong :class="f.pct >= 0 ? 'is-up' : 'is-down'">{{ f.pct >= 0 ? '+' : '−' }}{{ Math.abs(f.pct) }} % · {{ f.pct >= 0 ? '+' : '−' }}{{ fmtEur(Math.abs(f.amount)) }}</strong>
        </div>
        <div class="cms-factors-track" aria-hidden="true">
          <i class="cms-factors-zero" />
          <i class="cms-factors-bar" :class="f.pct >= 0 ? 'is-up' : 'is-down'" :style="barStyle(f.pct)" />
        </div>
        <p v-if="f.why" class="cms-factors-why">{{ f.why }}</p>
      </li>
    </ol>
    <div class="cms-factors-result">
      <span>Resultado del ejemplo</span>
      <strong data-testid="cms-factors-result">{{ fmtEur(total) }}</strong>
      <small>{{ totalPct >= 0 ? '+' : '−' }}{{ Math.abs(totalPct) }} % respecto al punto de partida</small>
    </div>
    <p class="cms-factors-note">Los porcentajes son un ejemplo para entender el mecanismo, no estadísticas de mercado: cada zona y cada vivienda tienen los suyos.</p>
  </figure>
</template>

<script setup lang="ts">
import { fmtEur } from '~/utils/compraGastos'

/**
 * Gráfico de barras (CSS, sin librerías) de cómo cada factor suma o resta a
 * un precio de partida ILUSTRATIVO. Siempre lo dice: no son datos de mercado.
 */
const props = defineProps<{ block: { title?: string; text?: string; base?: number; factors?: Array<{ label: string; pct: number; why?: string }> } }>()
const factors = computed(() => (props.block.factors || []).map((f) => ({ ...f, amount: Math.round(((props.block.base || 0) * f.pct) / 100) })))
const maxAbs = computed(() => Math.max(1, ...factors.value.map((f) => Math.abs(f.pct))))
const total = computed(() => Math.round((props.block.base || 0) * (1 + factors.value.reduce((s, f) => s + f.pct, 0) / 100)))
const totalPct = computed(() => Math.round(factors.value.reduce((s, f) => s + f.pct, 0) * 10) / 10)
function barStyle(pct: number) {
  const half = (Math.abs(pct) / maxAbs.value) * 50
  return pct >= 0 ? { left: '50%', width: `${half}%` } : { right: '50%', width: `${half}%` }
}
</script>

<style scoped>
.cms-factors {
  margin: 3rem 0;
  padding: 2rem;
  border-radius: 1.25rem;
  background: var(--cms-paper-2, #f6f4ef);
}
.cms-factors-head {
  margin: 0;
}
.cms-factors-title {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: -0.015em;
}
.cms-factors-text {
  margin: 0.4rem 0 0;
  font-size: 0.95rem;
  line-height: 1.5;
  color: #4f5b53;
  max-width: 60ch;
}
.cms-factors-base,
.cms-factors-result {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  margin-top: 1.5rem;
  font-size: 0.8rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #4f5b53;
}
.cms-factors-base strong,
.cms-factors-result strong {
  font-size: 1.6rem;
  letter-spacing: -0.02em;
  text-transform: none;
  color: var(--cms-accent, #1f4e5f);
  font-variant-numeric: tabular-nums;
}
.cms-factors-result small {
  text-transform: none;
  letter-spacing: 0;
  font-size: 0.85rem;
}
.cms-factors-list {
  margin: 1.5rem 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 1rem;
}
.cms-factors-label {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  font-size: 0.95rem;
}
.cms-factors-label strong {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.is-up {
  color: #2f7a4f;
}
.is-down {
  color: #b4412f;
}
.cms-factors-track {
  position: relative;
  height: 14px;
  margin-top: 0.4rem;
  border-radius: 999px;
  background: #e8e3d8;
}
.cms-factors-zero {
  position: absolute;
  left: 50%;
  top: -3px;
  bottom: -3px;
  width: 2px;
  background: #4f5b53;
}
.cms-factors-bar {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: 999px;
  transition: width 0.3s ease;
}
.cms-factors-bar.is-up {
  background: #2f7a4f;
}
.cms-factors-bar.is-down {
  background: #b4412f;
}
.cms-factors-why {
  margin: 0.35rem 0 0;
  font-size: 0.85rem;
  line-height: 1.45;
  color: #6b766d;
}
.cms-factors-note {
  margin: 1.25rem 0 0;
  font-size: 0.8rem;
  color: #7a857a;
}
@media (max-width: 639px) {
  .cms-factors {
    padding: 1.25rem;
  }
}
</style>
