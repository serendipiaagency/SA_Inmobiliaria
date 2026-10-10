<template>
  <section id="planes" class="lp-section" data-testid="landing-access">
    <div class="lp-shell">
      <div class="lp-access-head">
        <p class="lp-eyebrow">Planes y acceso</p>
        <h2 class="lp-h2">{{ LANDING_ACCESS.title }}</h2>
        <p class="lp-lede">Lo que hay hoy, dicho como es: cómo se empieza, qué incluye y qué queda por publicar.</p>
      </div>
      <ul class="lp-access-grid" role="list">
        <li v-for="(item, i) in LANDING_ACCESS.items" :key="item.title" class="lp-card lp-access-item" :data-testid="`landing-access-${i + 1}`">
          <span class="lp-icon"><LpIcon :name="ICONS[i] || 'check'" /></span>
          <h3>{{ item.title }}</h3>
          <p>{{ item.text }}</p>
        </li>
      </ul>
      <div class="lp-access-actions">
        <NuxtLink :to="LANDING_CTA.register.to" class="lp-btn lp-btn-accent" data-testid="landing-access-register" data-landing-event="cta_register_access">{{ LANDING_CTA.register.label }}<LpIcon name="arrow" class="lp-btn-icon" /></NuxtLink>
        <a :href="LANDING_CTA.demo.to" class="lp-btn lp-btn-ghost" data-testid="landing-access-demo">Consultar condiciones</a>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import LpIcon from './LpIcon.vue'
import { LANDING_ACCESS, LANDING_CTA } from '~/utils/landing'

/** Planes y acceso: sin precios inventados; condiciones bajo consulta y registro real. */
const ICONS = ['plus', 'eye', 'users', 'globe', 'support', 'tag']
</script>

<style scoped>
.lp-access-head {
  max-width: 720px;
}
.lp-access-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
  margin: 48px 0 0;
  padding: 0;
  list-style: none;
}
.lp-access-item h3 {
  margin: 18px 0 0;
  font-size: 18px;
}
.lp-access-item p {
  margin: 8px 0 0;
  font-size: 15px;
  line-height: 1.55;
}
.lp-access-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 40px;
}
@media (max-width: 1023px) {
  .lp-access-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 639px) {
  .lp-access-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
    margin-top: 32px;
  }
  .lp-access-actions .lp-btn {
    width: 100%;
  }
}
</style>
