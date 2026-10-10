<template>
  <section class="lp-section lp-dark lp-final" data-testid="landing-final">
    <div class="lp-shell lp-final-inner">
      <p class="lp-eyebrow">Empieza hoy</p>
      <h2 class="lp-h2 lp-final-title">{{ LANDING_FINAL.title }}</h2>
      <p class="lp-lede">{{ LANDING_FINAL.subtitle }}</p>
      <div class="lp-final-actions">
        <NuxtLink :to="LANDING_CTA.register.to" class="lp-btn lp-btn-accent" data-testid="landing-final-register" data-landing-event="cta_register_final">{{ LANDING_CTA.register.label }}<LpIcon name="arrow" class="lp-btn-icon" /></NuxtLink>
        <a :href="LANDING_CTA.demo.to" class="lp-btn lp-btn-ghost" data-testid="landing-final-demo">{{ LANDING_CTA.demo.label }}</a>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import LpIcon from './LpIcon.vue'
import { LANDING_CTA, LANDING_FINAL } from '~/utils/landing'
</script>

<style scoped>
.lp-final {
  position: relative;
  overflow: hidden;
}
.lp-final::before {
  content: '';
  position: absolute;
  inset: -40% -20% auto auto;
  width: 60%;
  aspect-ratio: 1;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(204, 85, 63, 0.28), transparent 60%);
  pointer-events: none;
}
.lp-final-inner {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.lp-final-title {
  max-width: 16ch;
}
.lp-final-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  margin-top: 36px;
}
@media (max-width: 639px) {
  .lp-final-actions .lp-btn {
    width: 100%;
  }
}
</style>
