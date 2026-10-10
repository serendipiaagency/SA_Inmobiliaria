<template>
  <section id="crm" class="lp-section" data-testid="landing-crm">
    <div class="lp-shell lp-split lp-split-rev">
      <div class="lp-split-copy">
        <p class="lp-eyebrow">CRM inmobiliario</p>
        <h2 class="lp-h2">{{ LANDING_CRM.title }}</h2>
        <p class="lp-lede">{{ LANDING_CRM.subtitle }}</p>
        <ul class="lp-benefits" role="list">
          <li v-for="b in LANDING_CRM.benefits" :key="b.title">
            <span class="lp-benefit-check"><LpIcon name="check" /></span>
            <span><strong>{{ b.title }}</strong><br>{{ b.text }}</span>
          </li>
        </ul>
      </div>
      <div class="lp-split-stage">
        <LpShot shot-key="crm" address="app.inmo/admin/leads" />
      </div>
    </div>

    <!-- Microdemo: el recorrido real de una consulta, paso a paso. -->
    <div class="lp-shell">
      <div class="lp-flow" data-testid="landing-crm-flow" @mouseenter="paused = true" @mouseleave="paused = false">
        <p class="lp-flow-title">De la consulta a la visita, sin perder nada por el camino</p>
        <ol class="lp-flow-steps">
          <li v-for="(step, i) in LANDING_CRM.flow" :key="step">
            <button type="button" class="lp-flow-step" :class="{ 'is-active': i === active, 'is-done': i < active }" :aria-current="i === active ? 'step' : undefined" :data-testid="`landing-crm-step-${i + 1}`" :data-active="i === active ? 'true' : 'false'" @click="select(i)">
              <span class="lp-flow-num">{{ i + 1 }}</span>
              <span class="lp-flow-label">{{ step }}</span>
            </button>
          </li>
        </ol>
        <p class="lp-flow-note">{{ NOTES[active] }}</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import LpIcon from './LpIcon.vue'
import LpShot from './LpShot.vue'
import { LANDING_CRM } from '~/utils/landing'

/**
 * CRM: la captura real del listado de leads y, debajo, un recorrido animado
 * (sin datos reales) de lo que pasa con una consulta. Avanza solo cada pocos
 * segundos, se para al pasar el ratón y respeta «reducir movimiento».
 */
const NOTES = [
  'Alguien rellena el formulario de tu web o de una ficha.',
  'El lead aparece en tu CRM con su mensaje, su origen y su idioma.',
  'Lo asignas tú, o lo hace una regla de reparto por zona, idioma u horario.',
  'La visita queda en la agenda del comercial, con su recordatorio.',
  'Cada llamada, nota y siguiente paso queda en el historial del lead.',
]
const active = ref(0)
const paused = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

function select(i: number) {
  active.value = i
}
onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  timer = setInterval(() => {
    if (!paused.value) active.value = (active.value + 1) % LANDING_CRM.flow.length
  }, 2600)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.lp-flow {
  margin-top: 56px;
  padding: 32px;
  border-radius: var(--lp-radius);
  background: var(--lp-white);
  border: 1px solid var(--lp-line);
}
.lp-flow-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--lp-ink);
}
.lp-flow-steps {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  margin: 20px 0 0;
  padding: 0;
  list-style: none;
}
.lp-flow-step {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--lp-line);
  background: var(--lp-paper);
  text-align: left;
  transition: background-color 0.3s, border-color 0.3s, color 0.3s, transform 0.3s var(--lp-ease);
}
.lp-flow-num {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  background: var(--lp-paper-2);
  font-size: 12px;
  font-weight: 700;
  color: var(--lp-ink);
  transition: inherit;
}
.lp-flow-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--lp-text);
}
.lp-flow-step.is-done .lp-flow-num {
  background: var(--lp-sage);
}
.lp-flow-step.is-active {
  background: var(--lp-ink);
  border-color: var(--lp-ink);
  transform: translateY(-2px);
}
.lp-flow-step.is-active .lp-flow-num {
  background: var(--lp-accent);
  color: #fff;
}
.lp-flow-step.is-active .lp-flow-label {
  color: #fff;
}
.lp-flow-note {
  margin: 18px 0 0;
  min-height: 1.5em;
  font-size: 14px;
  line-height: 1.5;
}
@media (max-width: 1023px) {
  .lp-flow-steps {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 639px) {
  .lp-flow {
    padding: 20px;
    margin-top: 36px;
  }
  .lp-flow-steps {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }
}
</style>
