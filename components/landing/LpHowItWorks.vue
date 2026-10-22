<template>
  <section id="como-funciona" class="lp-section lp-journey" data-testid="landing-how">
    <div class="lp-shell">
      <div class="lp-section-top lp-reveal">
        <h2 class="lp-h2">Del primer clic<br><span>a la siguiente operación.</span></h2>
        <div>
          <p>Un recorrido conectado para trabajar con continuidad, desde que incorporas una propiedad hasta que avanzas con un comprador.</p>
        </div>
      </div>

      <div class="lp-journey-grid lp-reveal">
        <div class="lp-journey-tabs" role="tablist" aria-label="Pasos del recorrido">
          <button
            v-for="(step, i) in LANDING_STEPS"
            :id="`lp-journey-tab-${step.key}`"
            :key="step.key"
            type="button"
            role="tab"
            class="lp-journey-tab"
            :class="{ 'is-active': i === active }"
            :aria-selected="i === active"
            :aria-controls="'lp-journey-display'"
            :tabindex="i === active ? 0 : -1"
            :data-testid="`landing-step-${step.key}`"
            :data-active="i === active ? 'true' : 'false'"
            @click="active = i"
            @keydown.left.prevent="move(-1)"
            @keydown.right.prevent="move(1)"
          >
            <span class="lp-journey-num">0{{ i + 1 }}</span>
            <span>{{ step.title }}</span>
          </button>
        </div>

        <div id="lp-journey-display" class="lp-journey-display" role="tabpanel" :aria-labelledby="`lp-journey-tab-${current.key}`" data-testid="landing-how-shot" :data-shot="current.shot">
          <Transition name="lp-swap" mode="out-in">
            <img :key="current.shot" :src="shot.src" :alt="shot.alt" :width="shot.width" :height="shot.height" loading="lazy" decoding="async">
          </Transition>
          <p>{{ current.text }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { LANDING_STEPS, LANDING_SHOTS } from '~/utils/landing'

/** Recorrido de seis pasos; el elegido enseña su pantalla real, con transición suave. */
const active = ref(0)
const current = computed(() => LANDING_STEPS[active.value] || LANDING_STEPS[0])
const shot = computed(() => LANDING_SHOTS[current.value.shot])
function move(delta: number) {
  active.value = (active.value + delta + LANDING_STEPS.length) % LANDING_STEPS.length
}
</script>

<style scoped>
.lp-journey {
  background: var(--lp-paper-2);
  border-top: 1px solid var(--lp-line);
}
.lp-journey-grid {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: clamp(32px, 5vw, 70px);
  align-items: center;
}
.lp-journey-tabs {
  display: flex;
  flex-direction: column;
}
.lp-journey-tab {
  display: flex;
  align-items: center;
  gap: 20px;
  width: 100%;
  padding: 20px 8px;
  border: 0;
  border-bottom: 1px solid #dfe4eb;
  background: none;
  text-align: left;
  color: #79818d;
  font-size: 15px;
  transition: color 0.3s, border-color 0.3s;
}
.lp-journey-num {
  font-size: 11px;
}
.lp-journey-tab > span:last-child {
  flex: 1;
}
.lp-journey-tab.is-active {
  color: var(--lp-blue);
  border-color: var(--lp-blue);
}
.lp-journey-display {
  padding: 12px;
  background: #fff;
  border: 1px solid #e1e5ec;
  border-radius: 12px;
  box-shadow: 0 20px 50px -30px rgba(0, 0, 0, 0.25);
}
.lp-journey-display img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 1.6;
  object-fit: cover;
  object-position: top;
  border-radius: 6px;
}
.lp-journey-display p {
  margin: 12px 0 4px;
  padding: 0 6px;
  font-size: 12.5px;
  min-height: 42px;
}
.lp-swap-enter-active,
.lp-swap-leave-active {
  transition: opacity 0.3s var(--lp-ease);
}
.lp-swap-enter-from,
.lp-swap-leave-to {
  opacity: 0;
}
@media (max-width: 860px) {
  .lp-journey-grid {
    grid-template-columns: 1fr;
    gap: 28px;
  }
}
</style>
