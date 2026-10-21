<template>
  <section id="funcionalidades" class="lp-section lp-features" data-testid="landing-features">
    <div class="lp-shell">
      <div class="lp-section-top lp-reveal">
        <h2 class="lp-h2">Todo lo que necesitas.<br><span>Justo donde lo necesitas.</span></h2>
        <div>
          <p>Explora cada área y descubre qué incluye INMO. Las funciones que requieren configuración y las que están en camino se indican expresamente.</p>
          <ul class="lp-legend" aria-label="Leyenda de estados">
            <li v-for="(label, key) in LANDING_FEATURE_STATE_LABEL" :key="key"><i :class="`is-${key}`" aria-hidden="true" />{{ label }}</li>
          </ul>
        </div>
      </div>

      <div class="lp-accordion lp-reveal">
        <details
          v-for="(g, gi) in LANDING_FEATURES"
          :key="g.key"
          class="lp-feature-group"
          :data-testid="`landing-feature-group-${g.key}`"
          :open="gi === 0 || undefined"
        >
          <summary>
            <span class="lp-feature-num">0{{ gi + 1 }}</span>
            <span class="lp-feature-title">{{ g.title }}</span>
          </summary>
          <div class="lp-feature-inner">
            <p class="lp-feature-intro">{{ g.intro }}</p>
            <ul class="lp-feature-list" role="list">
              <li v-for="(f, i) in g.items" :key="i" :data-state="f.state || 'available'">
                <i class="lp-feature-dot" :class="`is-${f.state || 'available'}`" aria-hidden="true" />
                <span>{{ f.text }}<em v-if="f.state && f.state !== 'available'" class="lp-feature-state" :class="`is-${f.state}`">{{ LANDING_FEATURE_STATE_LABEL[f.state] }}</em></span>
              </li>
            </ul>
          </div>
        </details>
      </div>

      <p class="lp-features-foot">{{ total }} capacidades en {{ LANDING_FEATURES.length }} áreas. ¿Te falta algo concreto? <a href="#solicitar-demo">Cuéntanoslo en la demo</a>.</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { LANDING_FEATURES, LANDING_FEATURE_STATE_LABEL } from '~/utils/landing'

/** Inventario completo y honesto de la plataforma, en desplegables (utils/landing.ts → LANDING_FEATURES). */
const total = LANDING_FEATURES.reduce((s, g) => s + g.items.length, 0)
</script>

<style scoped>
.lp-features {
  background: var(--lp-paper);
  border-top: 1px solid var(--lp-line);
}
.lp-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 13px;
  color: var(--lp-text);
}
.lp-legend li {
  display: inline-flex;
  align-items: center;
}
.lp-legend i,
.lp-feature-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  margin-right: 8px;
}
.is-available {
  background: #2f7a4f;
}
.is-with-ai {
  background: var(--lp-blue);
}
.is-with-provider {
  background: #c9a66b;
}
.is-soon {
  background: #a8a195;
}
.lp-accordion {
  border-top: 1px solid var(--lp-line);
}
.lp-feature-group {
  border-bottom: 1px solid var(--lp-line);
}
.lp-feature-group summary {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 25px 0;
  cursor: pointer;
  list-style: none;
  font-size: clamp(17px, 2vw, 21px);
  font-weight: 500;
  color: var(--lp-ink);
  transition: color 0.2s;
}
.lp-feature-group summary::-webkit-details-marker {
  display: none;
}
.lp-feature-num {
  font-size: 11px;
  font-weight: 600;
  color: #8f969f;
  min-width: 24px;
}
.lp-feature-title {
  flex: 1;
}
.lp-feature-group summary::after {
  content: '+';
  font-size: 25px;
  font-weight: 400;
  color: #747b84;
  transition: color 0.2s;
}
.lp-feature-group[open] summary {
  color: var(--lp-blue);
}
.lp-feature-group[open] summary::after {
  content: '−';
  color: var(--lp-blue);
}
.lp-feature-inner {
  padding: 0 0 28px 48px;
  animation: lp-detail-open 0.4s var(--lp-ease);
}
.lp-feature-intro {
  margin: 0 0 16px;
  font-size: 14px;
  color: var(--lp-muted);
}
.lp-feature-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 45px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.lp-feature-list li {
  display: flex;
  gap: 2px;
  align-items: flex-start;
  font-size: 13px;
  line-height: 1.7;
  color: #535c66;
}
.lp-feature-list .lp-feature-dot {
  flex-shrink: 0;
  margin-top: 8px;
}
.lp-feature-state {
  display: inline-block;
  margin-left: 6px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-style: normal;
  font-weight: 600;
  letter-spacing: 0.04em;
  vertical-align: 1px;
}
.lp-feature-state.is-with-ai {
  background: var(--lp-sky);
  color: #0a5bc4;
}
.lp-feature-state.is-with-provider {
  background: #fff4e6;
  color: #976329;
}
.lp-feature-state.is-soon {
  background: #eef0f3;
  color: var(--lp-muted);
}
.lp-features-foot {
  margin: 36px 0 0;
  font-size: 14px;
  color: var(--lp-text);
}
.lp-features-foot a {
  font-weight: 600;
  color: var(--lp-blue);
  text-decoration: underline;
  text-underline-offset: 3px;
}
@keyframes lp-detail-open {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@media (max-width: 720px) {
  .lp-feature-group summary {
    gap: 14px;
  }
  .lp-feature-inner {
    padding: 0 0 20px 38px;
  }
  .lp-feature-list {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}
</style>
