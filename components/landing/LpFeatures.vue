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
        <div
          v-for="(g, gi) in LANDING_FEATURES"
          :key="g.key"
          class="lp-feature-group"
          :data-testid="`landing-feature-group-${g.key}`"
          :data-open="openKey === g.key ? 'true' : 'false'"
        >
          <h3 class="lp-feature-h">
            <button
              :id="`lp-feat-summary-${g.key}`"
              type="button"
              class="lp-feature-summary"
              :aria-expanded="openKey === g.key"
              :aria-controls="`lp-feat-panel-${g.key}`"
              @click="toggle(g.key)"
            >
              <span class="lp-feature-num">0{{ gi + 1 }}</span>
              <span class="lp-feature-title">{{ g.title }}</span>
              <span class="lp-feature-sign" aria-hidden="true" />
            </button>
          </h3>
          <Transition name="lp-acc">
            <div v-show="openKey === g.key" :id="`lp-feat-panel-${g.key}`" class="lp-feature-inner" role="region" :aria-labelledby="`lp-feat-summary-${g.key}`">
              <div class="lp-feature-media">
                <div class="lp-feature-shot">
                  <div class="lp-feature-bar"><i /><i /><i /></div>
                  <img v-if="openKey === g.key" :src="shotFor(g.shot).src" :alt="shotFor(g.shot).alt" :width="shotFor(g.shot).width" :height="shotFor(g.shot).height" loading="lazy" decoding="async">
                </div>
              </div>
              <div class="lp-feature-body">
                <p class="lp-feature-intro">{{ g.intro }}</p>
                <ul class="lp-feature-list" role="list">
                  <li v-for="(f, i) in g.items" :key="i" :data-state="f.state || 'available'">
                    <i class="lp-feature-dot" :class="`is-${f.state || 'available'}`" aria-hidden="true" />
                    <span>{{ f.text }}<em v-if="f.state && f.state !== 'available'" class="lp-feature-state" :class="`is-${f.state}`">{{ LANDING_FEATURE_STATE_LABEL[f.state] }}</em></span>
                  </li>
                </ul>
              </div>
            </div>
          </Transition>
        </div>
      </div>

      <p class="lp-features-foot">Nos adaptamos a tu negocio. Añadiendo nuevas funcionalidades según tus necesidades. <a href="#solicitar-demo">Cuéntanoslo en la demo</a>.</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { LANDING_FEATURES, LANDING_FEATURE_STATE_LABEL, LANDING_SHOTS, type LandingShotKey } from '~/utils/landing'

/**
 * Inventario completo y honesto de la plataforma, en un acordeón EXCLUSIVO
 * (sólo un área abierta a la vez). Cada área enseña su captura real, que se
 * carga únicamente al abrirla (v-if), para no cargar todas al inicio.
 */
const openKey = ref<string | null>(LANDING_FEATURES[0]?.key ?? null)
function toggle(key: string) {
  openKey.value = openKey.value === key ? null : key
}
function shotFor(key: LandingShotKey) {
  return LANDING_SHOTS[key]
}
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
  margin-top: clamp(32px, 4vw, 48px);
  border-top: 1px solid var(--lp-line);
}
.lp-feature-group {
  border-bottom: 1px solid var(--lp-line);
}
.lp-feature-h {
  margin: 0;
  font-size: inherit;
  font-weight: inherit;
}
.lp-feature-summary {
  display: flex;
  align-items: center;
  gap: 24px;
  width: 100%;
  padding: 25px 0;
  border: 0;
  background: none;
  cursor: pointer;
  text-align: left;
  font-size: clamp(17px, 2vw, 21px);
  font-weight: 500;
  color: var(--lp-ink);
  transition: color 0.2s;
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
.lp-feature-sign {
  position: relative;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
.lp-feature-sign::before,
.lp-feature-sign::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 14px;
  height: 2px;
  background: #747b84;
  transform: translate(-50%, -50%);
  transition: transform 0.3s var(--lp-ease), background-color 0.3s;
}
.lp-feature-sign::after {
  transform: translate(-50%, -50%) rotate(90deg);
}
.lp-feature-group[data-open='true'] .lp-feature-summary {
  color: var(--lp-blue);
}
.lp-feature-group[data-open='true'] .lp-feature-sign::before,
.lp-feature-group[data-open='true'] .lp-feature-sign::after {
  background: var(--lp-blue);
}
.lp-feature-group[data-open='true'] .lp-feature-sign::after {
  transform: translate(-50%, -50%) rotate(0deg);
}
.lp-feature-inner {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(0, 6fr);
  gap: clamp(20px, 3vw, 40px);
  padding: 0 0 30px 48px;
  align-items: start;
}
.lp-feature-shot {
  border: 1px solid var(--lp-line);
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 24px 50px -36px rgba(32, 59, 92, 0.4);
}
.lp-feature-bar {
  display: flex;
  gap: 5px;
  padding: 10px 12px;
  background: #f4f6f9;
  border-bottom: 1px solid var(--lp-line);
}
.lp-feature-bar i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #d7dce3;
}
.lp-feature-shot img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 1.6;
  object-fit: cover;
  object-position: top;
}
.lp-feature-intro {
  margin: 0 0 16px;
  font-size: 14px;
  color: var(--lp-muted);
}
.lp-feature-list {
  display: grid;
  gap: 11px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.lp-feature-list li {
  display: flex;
  gap: 2px;
  align-items: flex-start;
  font-size: 13.5px;
  line-height: 1.6;
  color: #535c66;
}
.lp-feature-list .lp-feature-dot {
  flex-shrink: 0;
  margin-top: 7px;
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
/* Transición de apertura del panel */
.lp-acc-enter-active,
.lp-acc-leave-active {
  transition: opacity 0.3s var(--lp-ease), transform 0.3s var(--lp-ease);
  overflow: hidden;
}
.lp-acc-enter-from,
.lp-acc-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
@media (max-width: 760px) {
  .lp-feature-summary {
    gap: 14px;
  }
  .lp-feature-inner {
    grid-template-columns: 1fr;
    padding: 0 0 22px 0;
  }
}
</style>
