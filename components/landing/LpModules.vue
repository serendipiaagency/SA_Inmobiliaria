<template>
  <section id="producto" class="lp-modules-section" data-testid="landing-modules">
    <div class="lp-shell lp-strip">
      <span class="lp-strip-label">{{ LANDING_STRIP_INTRO }}</span>
      <a v-for="m in LANDING_MODULES" :key="m.key" :href="m.href" class="lp-strip-link" :data-testid="`landing-module-${m.key}`">{{ m.label }} <span aria-hidden="true">↗</span></a>
    </div>

    <div class="lp-shell lp-intro lp-reveal">
      <h2 class="lp-h2">{{ LANDING_INTRO.title[0] }}<br><span>{{ LANDING_INTRO.title[1] }}</span></h2>
      <div>
        <p>{{ LANDING_INTRO.text }}</p>
        <a :href="LANDING_INTRO.cta.to" class="lp-text-link">{{ LANDING_INTRO.cta.label }} <LpIcon name="arrow" /></a>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import LpIcon from './LpIcon.vue'
import { LANDING_INTRO, LANDING_MODULES, LANDING_STRIP_INTRO } from '~/utils/landing'

/** Cinta de módulos (una plataforma, cada enlace a su sección) y la idea central: menos herramientas, más inmobiliaria. */
</script>

<style scoped>
.lp-strip {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 16px 24px;
  padding: 27px clamp(20px, 4vw, 56px);
  border-top: 1px solid var(--lp-line);
  border-bottom: 1px solid var(--lp-line);
  font-size: 12px;
}
.lp-strip-label {
  color: #868a90;
  font-size: 11px;
}
.lp-strip-link {
  font-weight: 500;
  color: var(--lp-ink);
  transition: color 0.2s;
}
.lp-strip-link:hover {
  color: var(--lp-blue);
}
.lp-intro {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: clamp(32px, 6vw, 80px);
  align-items: center;
  padding-top: clamp(72px, 9vw, 115px);
  padding-bottom: clamp(72px, 9vw, 115px);
}
.lp-intro p {
  max-width: 460px;
  margin: 0 0 24px;
  font-size: 16px;
}
@media (max-width: 860px) {
  .lp-intro {
    grid-template-columns: 1fr;
    gap: 24px;
  }
}
</style>
