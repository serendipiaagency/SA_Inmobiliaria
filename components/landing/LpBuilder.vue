<template>
  <section id="constructor-web" class="lp-section lp-builder" data-testid="landing-builder">
    <div class="lp-shell lp-split">
      <div class="lp-split-copy">
        <p class="lp-eyebrow">Constructor Web</p>
        <h2 class="lp-h2">{{ LANDING_BUILDER.title }}</h2>
        <p class="lp-lede">{{ LANDING_BUILDER.subtitle }}</p>
        <ul class="lp-benefits" role="list">
          <li v-for="b in LANDING_BUILDER.benefits" :key="b.title">
            <span class="lp-benefit-check"><LpIcon name="check" /></span>
            <span><strong>{{ b.title }}</strong><br>{{ b.text }}</span>
          </li>
        </ul>
        <a :href="LANDING_BUILDER.cta.to" class="lp-btn lp-btn-primary lp-split-cta" data-testid="landing-builder-cta">{{ LANDING_BUILDER.cta.label }}<LpIcon name="arrow" class="lp-btn-icon" /></a>
      </div>
      <div class="lp-split-stage">
        <div class="lp-tabs" role="tablist" aria-label="Qué ver del Constructor Web">
          <button
            v-for="tab in LANDING_BUILDER.tabs"
            :id="`lp-builder-tab-${tab.key}`"
            :key="tab.key"
            type="button"
            role="tab"
            class="lp-tab"
            :aria-selected="active === tab.key"
            :aria-controls="`lp-builder-panel-${tab.key}`"
            :tabindex="active === tab.key ? 0 : -1"
            :data-testid="`landing-builder-tab-${tab.key}`"
            @click="active = tab.key"
            @keydown.left.right.prevent="toggle"
          >
            {{ tab.label }}
          </button>
        </div>
        <div :id="`lp-builder-panel-${current.key}`" role="tabpanel" :aria-labelledby="`lp-builder-tab-${current.key}`" class="lp-split-panel" data-testid="landing-builder-shot" :data-shot="current.shot">
          <Transition name="lp-fade" mode="out-in">
            <LpShot :key="current.shot" :shot-key="current.shot" :address="current.key === 'editor' ? 'app.inmo/admin/site-builder' : 'tu-inmobiliaria.com'" />
          </Transition>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import LpIcon from './LpIcon.vue'
import LpShot from './LpShot.vue'
import { LANDING_BUILDER } from '~/utils/landing'

/**
 * Constructor Web: a la izquierda el beneficio; a la derecha, las dos caras
 * reales del mismo sitio (el editor y la web publicada), capturas de la
 * cuenta de demostración.
 */
type TabKey = (typeof LANDING_BUILDER.tabs)[number]['key']
const active = ref<TabKey>('editor')
const current = computed(() => LANDING_BUILDER.tabs.find((t) => t.key === active.value) || LANDING_BUILDER.tabs[0])
function toggle() {
  active.value = active.value === 'editor' ? 'web' : 'editor'
}
</script>

<style>
/* Compartido por las secciones «de dos columnas» (Constructor, CRM, Propiedades). */
.sa-landing .lp-split {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  gap: 56px;
  align-items: center;
}
.sa-landing .lp-split-rev {
  grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
}
.sa-landing .lp-split-rev .lp-split-copy {
  order: 2;
}
.sa-landing .lp-benefits {
  display: grid;
  gap: 16px;
  margin: 28px 0 0;
  padding: 0;
  list-style: none;
}
.sa-landing .lp-benefits li {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  font-size: 15px;
  line-height: 1.5;
}
.sa-landing .lp-benefits strong {
  color: var(--lp-ink);
}
.sa-landing .lp-benefit-check {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  margin-top: 1px;
  border-radius: 999px;
  background: var(--lp-sage);
  color: var(--lp-ink);
}
.sa-landing .lp-benefit-check svg {
  width: 15px;
  height: 15px;
}
.sa-landing .lp-split-cta {
  margin-top: 32px;
}
.sa-landing .lp-split-stage .lp-tabs {
  margin-bottom: 16px;
}
.sa-landing .lp-btn-icon {
  width: 18px;
  height: 18px;
}
@media (max-width: 1023px) {
  .sa-landing .lp-split,
  .sa-landing .lp-split-rev {
    grid-template-columns: minmax(0, 1fr);
    gap: 36px;
  }
  .sa-landing .lp-split-rev .lp-split-copy {
    order: 0;
  }
}
</style>

<style scoped>
.lp-builder {
  background: linear-gradient(180deg, var(--lp-paper) 0%, var(--lp-paper-2) 100%);
}
</style>
