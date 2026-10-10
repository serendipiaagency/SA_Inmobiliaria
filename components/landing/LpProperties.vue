<template>
  <section id="propiedades" class="lp-section lp-props" data-testid="landing-properties">
    <div class="lp-shell lp-split">
      <div class="lp-split-copy">
        <p class="lp-eyebrow">Propiedades</p>
        <h2 class="lp-h2">{{ LANDING_PROPERTIES.title }}</h2>
        <p class="lp-lede">{{ LANDING_PROPERTIES.subtitle }}</p>
        <ul class="lp-chips" role="list" aria-label="Qué incluye la gestión de propiedades">
          <li v-for="b in LANDING_PROPERTIES.benefits" :key="b"><LpIcon name="check" />{{ b }}</li>
        </ul>
      </div>
      <div class="lp-split-stage">
        <div class="lp-tabs" role="tablist" aria-label="Qué ver de las propiedades">
          <button
            v-for="tab in LANDING_PROPERTIES.tabs"
            :id="`lp-props-tab-${tab.key}`"
            :key="tab.key"
            type="button"
            role="tab"
            class="lp-tab"
            :aria-selected="active === tab.key"
            :aria-controls="`lp-props-panel-${tab.key}`"
            :tabindex="active === tab.key ? 0 : -1"
            :data-testid="`landing-properties-tab-${tab.key}`"
            @click="active = tab.key"
            @keydown.left.right.prevent="toggle"
          >
            {{ tab.label }}
          </button>
        </div>
        <div :id="`lp-props-panel-${current.key}`" role="tabpanel" :aria-labelledby="`lp-props-tab-${current.key}`" data-testid="landing-properties-shot" :data-shot="current.shot">
          <Transition name="lp-fade" mode="out-in">
            <LpShot :key="current.shot" :shot-key="current.shot" :address="current.key === 'panel' ? 'app.inmo/admin/properties' : 'tu-inmobiliaria.com/propiedades'" />
          </Transition>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import LpIcon from './LpIcon.vue'
import LpShot from './LpShot.vue'
import { LANDING_PROPERTIES } from '~/utils/landing'

/** Propiedades: el editor del panel y la ficha pública, las dos de la misma propiedad de la cuenta demo. */
type TabKey = (typeof LANDING_PROPERTIES.tabs)[number]['key']
const active = ref<TabKey>('panel')
const current = computed(() => LANDING_PROPERTIES.tabs.find((t) => t.key === active.value) || LANDING_PROPERTIES.tabs[0])
function toggle() {
  active.value = active.value === 'panel' ? 'public' : 'panel'
}
</script>

<style scoped>
.lp-props {
  background: var(--lp-white);
  border-top: 1px solid var(--lp-line);
  border-bottom: 1px solid var(--lp-line);
}
.lp-chips {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 28px 0 0;
  padding: 0;
  list-style: none;
}
.lp-chips li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--lp-paper);
  border: 1px solid var(--lp-line);
  font-size: 14px;
  font-weight: 500;
  color: var(--lp-ink);
}
.lp-chips svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--lp-accent);
}
@media (max-width: 479px) {
  .lp-chips {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
