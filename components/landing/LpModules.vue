<template>
  <section id="producto" class="lp-section" data-testid="landing-modules">
    <div class="lp-shell">
      <div class="lp-modules-head">
        <p class="lp-eyebrow">Producto</p>
        <h2 class="lp-h2">Todo lo que necesitas para gestionar tu inmobiliaria.</h2>
        <p class="lp-lede">Seis módulos que trabajan juntos: lo que das de alta en uno aparece donde toca en los demás, sin volver a escribirlo.</p>
      </div>
      <ul class="lp-modules-grid" role="list">
        <li v-for="m in LANDING_MODULES" :key="m.key">
          <a :href="m.href" class="lp-card lp-module" :data-testid="`landing-module-${m.key}`">
            <span class="lp-icon"><LpIcon :name="m.key" /></span>
            <h3>{{ m.title }}</h3>
            <p>{{ m.text }}</p>
            <span class="lp-module-more">Ver cómo funciona <LpIcon name="arrow" /></span>
          </a>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import LpIcon from './LpIcon.vue'
import { LANDING_MODULES } from '~/utils/landing'

/** Resumen visual: seis tarjetas, una por módulo real, cada una hacia su sección. */
</script>

<style scoped>
.lp-modules-head {
  max-width: 720px;
}
.lp-modules-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
  margin: 48px 0 0;
  padding: 0;
  list-style: none;
}
.lp-module {
  display: flex;
  flex-direction: column;
  height: 100%;
  text-decoration: none;
}
.lp-module h3 {
  margin: 20px 0 0;
  font-size: 19px;
  line-height: 1.25;
}
.lp-module p {
  margin: 10px 0 0;
  font-size: 15px;
  line-height: 1.55;
}
.lp-module-more {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: auto;
  padding-top: 22px;
  font-size: 14px;
  font-weight: 600;
  color: var(--lp-ink);
}
.lp-module-more svg {
  width: 16px;
  height: 16px;
  transition: transform 0.2s var(--lp-ease);
}
.lp-module:hover .lp-module-more svg {
  transform: translateX(3px);
}
@media (max-width: 1023px) {
  .lp-modules-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 639px) {
  .lp-modules-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
    margin-top: 32px;
  }
}
</style>
