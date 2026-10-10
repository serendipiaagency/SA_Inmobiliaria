<template>
  <section id="funcionalidades" class="lp-section lp-features" data-testid="landing-features">
    <div class="lp-shell">
      <div class="lp-features-head">
        <p class="lp-eyebrow">Funcionalidades</p>
        <h2 class="lp-h2">Todo lo que incluye INMO, módulo a módulo.</h2>
        <p class="lp-lede">Cada punto es una pantalla real del panel. Lo que depende de un proveedor o de la IA lo dice; lo que todavía no está, también.</p>
        <ul class="lp-features-legend" aria-label="Leyenda de estados">
          <li v-for="(label, key) in LANDING_FEATURE_STATE_LABEL" :key="key"><i :class="`is-${key}`" aria-hidden="true" />{{ label }}</li>
        </ul>
      </div>
      <div class="lp-features-grid">
        <article v-for="g in LANDING_FEATURES" :key="g.key" class="lp-feature-group" :data-testid="`landing-feature-group-${g.key}`">
          <header class="lp-feature-head">
            <span class="lp-icon"><LpIcon :name="g.icon" /></span>
            <div>
              <h3>{{ g.title }}</h3>
              <p>{{ g.intro }}</p>
            </div>
          </header>
          <ul class="lp-feature-list" role="list">
            <li v-for="(f, i) in g.items" :key="i" :data-state="f.state || 'available'">
              <i class="lp-feature-dot" :class="`is-${f.state || 'available'}`" aria-hidden="true" />
              <span>{{ f.text }}<em v-if="f.state && f.state !== 'available'" class="lp-feature-state" :class="`is-${f.state}`">{{ LANDING_FEATURE_STATE_LABEL[f.state] }}</em></span>
            </li>
          </ul>
        </article>
      </div>
      <p class="lp-features-foot">Total: {{ total }} capacidades en {{ LANDING_FEATURES.length }} áreas. ¿Te falta algo concreto? <a href="#solicitar-demo">Cuéntanoslo en la demo</a>.</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import LpIcon from './LpIcon.vue'
import { LANDING_FEATURES, LANDING_FEATURE_STATE_LABEL } from '~/utils/landing'

/** Inventario completo y honesto de la plataforma (utils/landing.ts → LANDING_FEATURES). */
const total = LANDING_FEATURES.reduce((s, g) => s + g.items.length, 0)
</script>

<style scoped>
.lp-features {
  background: var(--lp-white);
  border-top: 1px solid var(--lp-line);
  border-bottom: 1px solid var(--lp-line);
}
.lp-features-head {
  max-width: 760px;
}
.lp-features-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  margin: 22px 0 0;
  padding: 0;
  list-style: none;
  font-size: 13px;
  color: var(--lp-text);
}
.lp-features-legend i,
.lp-feature-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  margin-right: 8px;
  vertical-align: 1px;
}
.is-available {
  background: #2f7a4f;
}
.is-with-ai {
  background: var(--lp-accent);
}
.is-with-provider {
  background: #c9a66b;
}
.is-soon {
  background: #a8a195;
}
.lp-features-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px;
  margin-top: 48px;
}
.lp-feature-group {
  padding: 28px;
  border: 1px solid var(--lp-line);
  border-radius: var(--lp-radius);
  background: var(--lp-paper);
}
.lp-feature-head {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}
.lp-feature-head h3 {
  margin: 4px 0 0;
  font-size: 19px;
  line-height: 1.25;
}
.lp-feature-head p {
  margin: 6px 0 0;
  font-size: 14px;
  line-height: 1.5;
}
.lp-feature-list {
  display: grid;
  gap: 10px;
  margin: 20px 0 0;
  padding: 0;
  list-style: none;
}
.lp-feature-list li {
  display: flex;
  gap: 2px;
  align-items: flex-start;
  font-size: 14.5px;
  line-height: 1.5;
  color: var(--lp-ink-soft);
}
.lp-feature-list .lp-feature-dot {
  flex-shrink: 0;
  margin-top: 7px;
}
.lp-feature-state {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  vertical-align: 1px;
}
.lp-feature-state.is-with-ai {
  background: var(--lp-accent-soft);
  color: #8c3522;
}
.lp-feature-state.is-with-provider {
  background: #f6ecd8;
  color: #6b4e14;
}
.lp-feature-state.is-soon {
  background: #ebe7df;
  color: var(--lp-muted);
}
.lp-features-foot {
  margin: 28px 0 0;
  font-size: 14px;
  color: var(--lp-text);
}
.lp-features-foot a {
  font-weight: 600;
  color: var(--lp-ink);
  text-decoration: underline;
  text-underline-offset: 3px;
}
@media (max-width: 1023px) {
  .lp-features-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
    margin-top: 32px;
  }
}
@media (max-width: 639px) {
  .lp-feature-group {
    padding: 20px;
  }
}
</style>
