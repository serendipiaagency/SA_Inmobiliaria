<template>
  <section class="lp-hero" data-testid="landing-hero">
    <div class="lp-shell lp-hero-inner">
      <div class="lp-hero-copy">
        <h1 class="lp-h1">
          <template v-for="(line, i) in LANDING_HERO.title" :key="line">
            <em v-if="i === LANDING_HERO.title.length - 1">{{ line }}</em>
            <template v-else>{{ line }}</template>
            <br v-if="i < LANDING_HERO.title.length - 1">
          </template>
        </h1>
        <p class="lp-hero-lede">{{ LANDING_HERO.subtitle }}</p>
        <div class="lp-hero-actions">
          <a :href="LANDING_HERO.primary.to" class="lp-btn lp-btn-primary" data-testid="landing-hero-demo" data-landing-event="cta_demo_hero">{{ LANDING_HERO.primary.label }} <span aria-hidden="true">↗</span></a>
          <NuxtLink :to="LANDING_HERO.secondary.to" class="lp-btn lp-btn-ghost" data-testid="landing-hero-register" data-landing-event="cta_register_hero">{{ LANDING_HERO.secondary.label }}</NuxtLink>
          <a :href="LANDING_HERO.explore.to" class="lp-text-link lp-hero-explore">{{ LANDING_HERO.explore.label }} <LpIcon name="chevron" /></a>
        </div>
        <p class="lp-hero-note"><span class="lp-dot" aria-hidden="true" /> {{ LANDING_HERO.note }}</p>
      </div>

      <div class="lp-hero-media">
        <div class="lp-photo-stack">
          <img
            v-for="(s, i) in LANDING_HERO.stack"
            :key="s.photo"
            :class="{ 'is-active': i === active }"
            :src="LANDING_PHOTOS[s.photo].src"
            :alt="LANDING_PHOTOS[s.photo].alt"
            :width="LANDING_PHOTOS[s.photo].width"
            :height="LANDING_PHOTOS[s.photo].height"
            :loading="i === 0 ? 'eager' : 'lazy'"
            :fetchpriority="i === 0 ? 'high' : undefined"
            decoding="async"
          >
        </div>
        <div class="lp-photo-caption">
          <span>{{ LANDING_HERO.stack[active].label }}</span>
          <div class="lp-photo-dots">
            <button
              v-for="(s, i) in LANDING_HERO.stack"
              :key="s.photo"
              type="button"
              class="lp-photo-dot"
              :class="{ 'is-active': i === active }"
              :aria-label="`Ver ${LANDING_PHOTOS[s.photo].alt}`"
              :aria-pressed="i === active"
              @click="select(i)"
            />
            <button type="button" class="lp-photo-pause" :aria-label="paused ? 'Reanudar la galería' : 'Pausar la galería'" @click="togglePause">{{ paused ? '▶' : 'Ⅱ' }}</button>
          </div>
        </div>
        <div class="lp-float-card">
          <span class="lp-float-icon" aria-hidden="true">↗</span>
          <div>
            <strong>{{ LANDING_HERO.floatCard.title }}</strong>
            <small>{{ LANDING_HERO.floatCard.text }}</small>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import LpIcon from './LpIcon.vue'
import { LANDING_HERO, LANDING_PHOTOS } from '~/utils/landing'

/**
 * Hero: titular a la izquierda y, a la derecha, una galería de propiedades de
 * lujo (fotografía de ambiente) que se alterna con transición suave. Avanza
 * sola cada pocos segundos, se puede pausar y respeta «reducir movimiento».
 */
const active = ref(0)
const paused = ref(false)
let timer: ReturnType<typeof setInterval> | null = null
const COUNT = LANDING_HERO.stack.length

function select(i: number) {
  active.value = i
}
function togglePause() {
  paused.value = !paused.value
}
onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    paused.value = true
    return
  }
  timer = setInterval(() => {
    if (!paused.value && !document.hidden) active.value = (active.value + 1) % COUNT
  }, 6500)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.lp-hero {
  position: relative;
  padding: clamp(40px, 6vw, 72px) 0 clamp(48px, 6vw, 64px);
  background:
    radial-gradient(900px 520px at 88% -12%, #eef5ff, transparent 62%),
    radial-gradient(640px 420px at 6% 108%, #eef5ff, transparent 60%),
    var(--lp-paper);
  overflow: hidden;
}
.lp-hero-inner {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: clamp(32px, 4vw, 45px);
  align-items: center;
}
.lp-hero-lede {
  margin: 26px 0 0;
  font-size: 17px;
  line-height: 1.75;
  max-width: 44ch;
}
.lp-hero-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px 26px;
  margin-top: 34px;
}
.lp-hero-note {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 36px 0 0;
  font-size: 12px;
  color: var(--lp-muted);
}
/* Galería de fotos */
.lp-hero-media {
  position: relative;
  height: clamp(380px, 46vw, 560px);
  border-radius: 14px;
  background: #dbe8ed;
}
.lp-photo-stack {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: 14px;
}
.lp-photo-stack::after {
  content: '';
  position: absolute;
  inset: 62% 0 0;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.55));
}
.lp-photo-stack img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transform: scale(1.06);
  transition: opacity 1.4s var(--lp-ease), transform 7s var(--lp-ease);
}
.lp-photo-stack img.is-active {
  opacity: 1;
  transform: scale(1);
}
.lp-photo-caption {
  position: absolute;
  left: 26px;
  right: 24px;
  bottom: 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
  color: #fff;
  font-size: 13px;
  z-index: 1;
}
.lp-photo-dots {
  display: flex;
  gap: 8px;
  align-items: center;
}
.lp-photo-dot {
  width: 7px;
  height: 7px;
  padding: 0;
  border: 0;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.45);
  transition: width 0.4s var(--lp-ease), background-color 0.3s;
}
.lp-photo-dot.is-active {
  width: 22px;
  background: #fff;
}
.lp-photo-pause {
  border: 0;
  background: transparent;
  color: #fff;
  font-size: 13px;
  padding: 4px 6px;
  line-height: 1;
}
.lp-float-card {
  position: absolute;
  left: -22px;
  bottom: 78px;
  display: flex;
  gap: 13px;
  align-items: center;
  padding: 16px 18px;
  max-width: 230px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(12px);
  border: 1px solid #fff;
  border-radius: 12px;
  box-shadow: 0 18px 44px -20px rgba(16, 19, 25, 0.5);
  animation: lp-float 5s ease-in-out infinite;
}
.lp-float-icon {
  flex-shrink: 0;
  padding: 9px 13px;
  color: var(--lp-blue);
  background: var(--lp-sky);
  border-radius: 9px;
  font-size: 22px;
  line-height: 1;
}
.lp-float-card strong {
  display: block;
  font-size: 12px;
  color: var(--lp-ink);
}
.lp-float-card small {
  display: block;
  margin-top: 5px;
  font-size: 11px;
  color: var(--lp-muted);
}
@media (max-width: 860px) {
  .lp-hero-inner {
    grid-template-columns: 1fr;
    gap: 36px;
  }
  .lp-float-card {
    left: 0;
    bottom: 70px;
    padding: 13px 15px;
  }
}
</style>
