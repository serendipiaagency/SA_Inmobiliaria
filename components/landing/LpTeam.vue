<template>
  <section class="lp-team" data-testid="landing-team">
    <img :src="base.src" :alt="base.alt" :width="base.width" :height="base.height" loading="lazy" decoding="async">
    <img class="lp-team-second" :src="over.src" :alt="over.alt" :width="over.width" :height="over.height" loading="lazy" decoding="async">
    <div class="lp-shell lp-team-shell">
      <div class="lp-team-copy lp-reveal">
      <h2 class="lp-h2">
        <template v-for="(line, i) in LANDING_TEAM.title" :key="line">
          <span v-if="i === LANDING_TEAM.title.length - 1">{{ line }}</span>
          <template v-else>{{ line }}</template>
          <br v-if="i < LANDING_TEAM.title.length - 1">
        </template>
      </h2>
      <p>{{ LANDING_TEAM.text }}</p>
      <a :href="LANDING_TEAM.cta.to" class="lp-btn lp-btn-white">{{ LANDING_TEAM.cta.label }}</a>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { LANDING_PHOTOS, LANDING_TEAM } from '~/utils/landing'

/**
 * Equipo: fotografía de ambiente (profesionales) con dos imágenes que se
 * funden entre sí. La tecnología conecta; el equipo hace que suceda.
 */
const base = LANDING_PHOTOS[LANDING_TEAM.photos[0]]
const over = LANDING_PHOTOS[LANDING_TEAM.photos[1]]
</script>

<style scoped>
.lp-team {
  position: relative;
  height: clamp(460px, 56vw, 600px);
  overflow: hidden;
}
.lp-team > img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 40%;
}
.lp-team-second {
  opacity: 0;
  animation: lp-teamfade 14s ease-in-out infinite;
}
.lp-team::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(10, 23, 35, 0.86), transparent 70%);
}
.lp-team-shell {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  height: 100%;
}
.lp-team-copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  max-width: 560px;
  color: #fff;
}
.lp-team-copy :deep(.lp-h2) {
  color: #fff;
  font-size: clamp(32px, 4vw, 50px);
}
.lp-team-copy :deep(.lp-h2 span) {
  color: #a8d0ff;
}
.lp-team-copy p {
  max-width: 390px;
  margin: 24px 0 30px;
  font-size: 14px;
  color: #d7dee5;
}
@keyframes lp-teamfade {
  0%, 15%, 100% {
    opacity: 0;
    transform: scale(1.03);
  }
  40%, 70% {
    opacity: 1;
    transform: scale(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .lp-team-second {
    display: none;
  }
}
</style>
