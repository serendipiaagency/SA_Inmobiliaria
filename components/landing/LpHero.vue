<template>
  <section class="lp-hero" data-testid="landing-hero">
    <div class="lp-shell lp-hero-inner">
      <div class="lp-hero-copy">
        <p class="lp-eyebrow"><span class="lp-dot" aria-hidden="true" />{{ LANDING_HERO.eyebrow }}</p>
        <h1 class="lp-h1">{{ LANDING_HERO.title[0] }} <em>{{ LANDING_HERO.title[1] }}</em></h1>
        <p class="lp-hero-lede">{{ LANDING_HERO.subtitle }}</p>
        <div class="lp-hero-actions">
          <NuxtLink :to="LANDING_CTA.register.to" class="lp-btn lp-btn-accent" data-testid="landing-hero-register" data-landing-event="cta_register_hero">{{ LANDING_CTA.register.label }}<LpIcon name="arrow" class="lp-btn-icon" /></NuxtLink>
          <a :href="LANDING_HERO.secondary.to" class="lp-btn lp-btn-ghost" data-testid="landing-hero-demo" data-landing-event="cta_demo_hero">{{ LANDING_HERO.secondary.label }}</a>
        </div>
        <ul class="lp-hero-facts" aria-label="Qué incluye">
          <li v-for="f in facts" :key="f"><LpIcon name="check" />{{ f }}</li>
        </ul>
      </div>

      <div class="lp-hero-stage">
        <LpShot shot-key="panel" address="app.inmo/admin" eager />
        <!-- Tarjetas demostrativas (no es actividad real de ningún cliente) -->
        <ul class="lp-floats" aria-label="Ejemplos de lo que llega al panel" data-testid="landing-floats">
          <li v-for="(f, i) in LANDING_HERO.floats" :key="f.key" class="lp-float" :class="`lp-float-${i + 1}`">
            <span class="lp-float-icon"><LpIcon :name="FLOAT_ICON[f.key]" /></span>
            <span class="lp-float-text"><strong>{{ f.eyebrow }}</strong><small>{{ f.text }}</small></span>
            <span class="lp-float-tag">Ejemplo</span>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import LpIcon from './LpIcon.vue'
import LpShot from './LpShot.vue'
import { LANDING_CTA, LANDING_HERO } from '~/utils/landing'

/**
 * Hero: responde en cinco segundos qué es INMO, qué se puede hacer y cómo
 * empezar. Titular a la izquierda y, a la derecha, el panel real (captura de
 * la cuenta de demostración) con tarjetas demostrativas alrededor.
 */
const facts = ['Web propia con el Constructor', 'CRM, agenda y operaciones', 'Un espacio por inmobiliaria']
const FLOAT_ICON: Record<string, string> = { lead: 'inbox', published: 'globe', visit: 'agenda', assigned: 'users' }
</script>

<style scoped>
.lp-hero {
  position: relative;
  padding: 56px 0 72px;
  margin-top: -72px;
  padding-top: 128px;
  background:
    radial-gradient(900px 500px at 85% -10%, rgba(225, 232, 220, 0.9), transparent 60%),
    radial-gradient(600px 400px at 10% 100%, rgba(251, 233, 226, 0.7), transparent 60%),
    var(--lp-paper);
  overflow: hidden;
}
.lp-hero-inner {
  display: grid;
  gap: 48px;
  align-items: center;
}
.lp-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--lp-accent);
}
.lp-h1 {
  margin: 22px 0 0;
  font-size: clamp(40px, 6.4vw, 76px);
  line-height: 1.02;
  letter-spacing: -0.035em;
}
.lp-h1 em {
  font-style: normal;
  color: var(--lp-accent);
  background: linear-gradient(90deg, var(--lp-accent), #e4765f);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.lp-hero-lede {
  margin: 22px 0 0;
  font-size: 19px;
  line-height: 1.6;
  max-width: 50ch;
}
.lp-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 32px;
}
.lp-btn-icon {
  width: 18px;
  height: 18px;
}
.lp-hero-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 22px;
  margin: 28px 0 0;
  padding: 0;
  list-style: none;
  font-size: 14px;
  font-weight: 500;
  color: var(--lp-ink-soft);
}
.lp-hero-facts li {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.lp-hero-facts svg {
  width: 16px;
  height: 16px;
  color: var(--lp-accent);
}
.lp-hero-stage {
  position: relative;
}
.lp-floats {
  list-style: none;
  margin: 14px 0 0;
  padding: 0;
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.lp-float {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  background: var(--lp-white);
  border: 1px solid var(--lp-line);
  box-shadow: 0 12px 30px -20px rgba(23, 44, 34, 0.45);
}
.lp-float-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 10px;
  background: var(--lp-sage);
  color: var(--lp-ink);
}
.lp-float-icon svg {
  width: 18px;
  height: 18px;
}
.lp-float-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.25;
}
.lp-float-text strong {
  font-size: 13px;
  color: var(--lp-ink);
}
.lp-float-text small {
  font-size: 12px;
  color: var(--lp-muted);
}
.lp-float-tag {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--lp-muted);
}
@media (min-width: 1024px) {
  .lp-hero {
    padding-top: 150px;
    padding-bottom: 96px;
  }
  .lp-hero-inner {
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
    gap: 56px;
  }
  .lp-floats {
    display: block;
    margin: 0;
  }
  .lp-float {
    position: absolute;
    width: 250px;
    animation: lp-float-in 0.8s var(--lp-ease) both;
  }
  .lp-float-1 {
    left: -36px;
    top: 10%;
    animation-delay: 0.2s;
  }
  .lp-float-2 {
    right: -28px;
    top: 30%;
    animation-delay: 0.35s;
  }
  .lp-float-3 {
    left: -24px;
    bottom: 22%;
    animation-delay: 0.5s;
  }
  .lp-float-4 {
    right: -20px;
    bottom: 6%;
    animation-delay: 0.65s;
  }
}
@keyframes lp-float-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
</style>
