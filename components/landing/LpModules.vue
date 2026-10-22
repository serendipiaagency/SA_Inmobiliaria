<template>
  <section id="producto" class="lp-section lp-modules-section" data-testid="landing-modules">
    <div class="lp-shell">
      <div class="lp-modules-head lp-reveal">
        <h2 class="lp-h2">Una plataforma.<br><span>Toda tu inmobiliaria.</span></h2>
        <p class="lp-lede">{{ LANDING_STRIP_SUBTITLE }}</p>
      </div>
      <ul class="lp-modules-grid">
        <li v-for="(m, i) in LANDING_MODULES" :key="m.key" class="lp-reveal" :style="{ transitionDelay: i * 90 + 'ms' }">
          <a :href="m.href" class="lp-module-card" :data-testid="`landing-module-${m.key}`">
            <span class="lp-module-icon"><LpIcon :name="m.icon" /></span>
            <h3>{{ m.label }}</h3>
            <p>{{ m.desc }}</p>
            <span class="lp-module-go" aria-hidden="true">Descubrir</span>
          </a>
        </li>
      </ul>
    </div>

    <div class="lp-shell lp-intro lp-reveal">
      <h2 class="lp-h2">{{ LANDING_INTRO.title[0] }}<br><span>{{ LANDING_INTRO.title[1] }}</span></h2>
      <div>
        <p>{{ LANDING_INTRO.text }}</p>
        <a :href="LANDING_INTRO.cta.to" class="lp-btn lp-btn-ghost lp-btn-sm">{{ LANDING_INTRO.cta.label }}</a>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import LpIcon from './LpIcon.vue'
import { LANDING_INTRO, LANDING_MODULES, LANDING_STRIP_SUBTITLE } from '~/utils/landing'

/** Bloque protagonista «Una plataforma. Toda tu inmobiliaria» (cuatro módulos, cada uno a su sección) y la idea central. */
</script>

<style scoped>
.lp-modules-section {
  background: linear-gradient(180deg, var(--lp-paper) 0%, var(--lp-paper-2) 100%);
  border-bottom: 1px solid var(--lp-line);
}
.lp-modules-head {
  max-width: 700px;
}
.lp-modules-head .lp-lede {
  margin-top: 18px;
}
.lp-modules-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  margin: clamp(36px, 5vw, 56px) 0 0;
  padding: 0;
  list-style: none;
}
.lp-module-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 26px 24px 22px;
  border-radius: 16px;
  background: #fff;
  border: 1px solid var(--lp-line);
  box-shadow: 0 1px 2px rgba(16, 19, 25, 0.04);
  transition: transform 0.3s var(--lp-ease), box-shadow 0.3s, border-color 0.3s;
}
.lp-module-card:hover {
  transform: translateY(-6px);
  border-color: #c7dcfb;
  box-shadow: 0 26px 50px -30px rgba(8, 124, 250, 0.45);
}
.lp-module-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: 13px;
  background: var(--lp-sky);
  color: var(--lp-blue);
  transition: background-color 0.3s, color 0.3s, transform 0.3s var(--lp-ease);
}
.lp-module-icon :deep(svg) {
  width: 24px;
  height: 24px;
}
.lp-module-card:hover .lp-module-icon {
  background: var(--lp-blue);
  color: #fff;
  transform: scale(1.06);
}
.lp-module-card h3 {
  margin: 18px 0 0;
  font-size: 19px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--lp-ink);
}
.lp-module-card p {
  margin: 9px 0 0;
  font-size: 14px;
  line-height: 1.55;
}
.lp-module-go {
  margin-top: auto;
  padding-top: 20px;
  font-size: 13px;
  font-weight: 600;
  color: var(--lp-blue);
  opacity: 0.7;
  transition: opacity 0.3s;
}
.lp-module-card:hover .lp-module-go {
  opacity: 1;
}
/* Intro «Menos herramientas» */
.lp-intro {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: clamp(32px, 6vw, 80px);
  align-items: center;
  padding-top: clamp(64px, 8vw, 104px);
  padding-bottom: clamp(8px, 2vw, 24px);
}
.lp-intro p {
  max-width: 460px;
  margin: 0 0 24px;
  font-size: 16px;
}
@media (max-width: 1023px) {
  .lp-modules-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 860px) {
  .lp-intro {
    grid-template-columns: 1fr;
    gap: 24px;
  }
}
@media (max-width: 519px) {
  .lp-modules-grid {
    grid-template-columns: 1fr;
    gap: 14px;
  }
}
</style>
