<template>
  <section id="como-funciona" class="lp-section lp-how" data-testid="landing-how">
    <div class="lp-shell">
      <div class="lp-how-head">
        <p class="lp-eyebrow">Cómo funciona</p>
        <h2 class="lp-h2">De la propiedad a la operación, en seis pasos.</h2>
        <p class="lp-lede">El recorrido real de una venta dentro de INMO. Cada paso enseña la pantalla en la que ocurre.</p>
      </div>
      <div class="lp-how-body">
        <ol class="lp-timeline" aria-label="Pasos">
          <li v-for="(step, i) in LANDING_STEPS" :key="step.key">
            <button type="button" class="lp-tl-step" :class="{ 'is-active': i === active }" :aria-current="i === active ? 'step' : undefined" :aria-expanded="i === active" :data-testid="`landing-step-${step.key}`" :data-active="i === active ? 'true' : 'false'" @click="active = i">
              <span class="lp-tl-num">{{ i + 1 }}</span>
              <span class="lp-tl-text">
                <strong>{{ step.title }}</strong>
                <span>{{ step.text }}</span>
              </span>
            </button>
            <div v-if="i === active" class="lp-tl-shot-mobile">
              <LpShot :shot-key="step.shot" :address="ADDRESS[step.shot]" />
            </div>
          </li>
        </ol>
        <div class="lp-how-stage" data-testid="landing-how-shot" :data-shot="current.shot">
          <Transition name="lp-fade" mode="out-in">
            <LpShot :key="current.shot" :shot-key="current.shot" :address="ADDRESS[current.shot]" />
          </Transition>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import LpShot from './LpShot.vue'
import { LANDING_STEPS } from '~/utils/landing'

/**
 * Línea de tiempo de seis pasos; el elegido enseña su pantalla real a la
 * derecha (en escritorio, fija mientras se baja) o debajo (en móvil).
 */
const ADDRESS: Record<string, string> = {
  'propiedad-panel': 'app.inmo/admin/properties/…',
  'ficha-publica': 'tu-inmobiliaria.com/propiedades/…',
  'web-contacto': 'tu-inmobiliaria.com/contacto',
  crm: 'app.inmo/admin/leads',
  agenda: 'app.inmo/admin/calendar',
  operaciones: 'app.inmo/admin/operaciones',
}
const active = ref(0)
const current = computed(() => LANDING_STEPS[active.value] || LANDING_STEPS[0])
</script>

<style scoped>
.lp-how {
  background: var(--lp-paper-2);
}
.lp-how-head {
  max-width: 720px;
}
.lp-how-body {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  gap: 48px;
  margin-top: 48px;
  align-items: start;
}
.lp-timeline {
  position: relative;
  margin: 0;
  padding: 0;
  list-style: none;
}
.lp-timeline::before {
  content: '';
  position: absolute;
  left: 19px;
  top: 20px;
  bottom: 20px;
  width: 2px;
  background: var(--lp-line);
}
.lp-tl-step {
  position: relative;
  display: flex;
  width: 100%;
  gap: 16px;
  align-items: flex-start;
  padding: 14px 16px 14px 0;
  text-align: left;
  border-radius: 16px;
  transition: background-color 0.2s;
}
.lp-tl-step:hover {
  background: rgba(255, 255, 255, 0.6);
}
.lp-tl-num {
  position: relative;
  z-index: 1;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  background: var(--lp-white);
  border: 2px solid var(--lp-line);
  font-size: 14px;
  font-weight: 700;
  color: var(--lp-ink);
  transition: background-color 0.25s, border-color 0.25s, color 0.25s;
}
.lp-tl-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-top: 8px;
}
.lp-tl-text strong {
  font-size: 17px;
  color: var(--lp-ink);
}
.lp-tl-text span {
  font-size: 14px;
  line-height: 1.5;
}
.lp-tl-step.is-active {
  background: var(--lp-white);
  box-shadow: var(--lp-shadow);
}
.lp-tl-step.is-active .lp-tl-num {
  background: var(--lp-ink);
  border-color: var(--lp-ink);
  color: #fff;
}
.lp-tl-shot-mobile {
  display: none;
  margin: 8px 0 16px 0;
}
.lp-how-stage {
  position: sticky;
  top: 96px;
}
@media (max-width: 1023px) {
  .lp-how-body {
    grid-template-columns: minmax(0, 1fr);
    gap: 24px;
    margin-top: 32px;
  }
  .lp-how-stage {
    display: none;
  }
  .lp-tl-shot-mobile {
    display: block;
  }
  .lp-timeline::before {
    display: none;
  }
  .lp-tl-step {
    padding: 12px;
  }
}
</style>
