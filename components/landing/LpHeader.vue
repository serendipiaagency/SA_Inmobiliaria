<template>
  <header class="lp-header" :class="{ 'is-solid': solid || open }" data-testid="landing-header">
    <div class="lp-shell lp-header-inner">
      <NuxtLink to="/" class="lp-brand" aria-label="INMO, inicio">inmo<sup>®</sup></NuxtLink>

      <nav class="lp-nav" aria-label="Secciones de la página">
        <a v-for="item in LANDING_NAV" :key="item.href" :href="item.href" :data-nav="item.href.slice(1)">{{ item.label }}</a>
      </nav>

      <div class="lp-actions">
        <NuxtLink :to="LANDING_CTA.login.to" class="lp-login" data-testid="landing-login">{{ LANDING_CTA.login.label }} <span aria-hidden="true">↗</span></NuxtLink>
        <a :href="LANDING_CTA.demo.to" class="lp-btn lp-btn-primary lp-btn-sm lp-demo-btn" data-testid="landing-demo" data-landing-event="cta_demo_header">{{ LANDING_CTA.demo.label }} <span aria-hidden="true">↗</span></a>
        <button type="button" class="lp-menu-btn" :aria-expanded="open" aria-controls="lp-mobile-nav" :aria-label="open ? 'Cerrar menú' : 'Abrir menú'" data-testid="landing-menu" @click="open = !open">
          <LpIcon :name="open ? 'close' : 'menu'" />
        </button>
      </div>
    </div>

    <transition name="lp-fade">
      <nav v-if="open" id="lp-mobile-nav" class="lp-mobile" aria-label="Menú" data-testid="landing-mobile-nav">
        <a v-for="item in LANDING_NAV" :key="item.href" :href="item.href" @click="open = false">{{ item.label }}</a>
        <NuxtLink :to="LANDING_CTA.login.to" @click="open = false">{{ LANDING_CTA.login.label }}</NuxtLink>
        <a :href="LANDING_CTA.demo.to" class="lp-btn lp-btn-ghost" @click="open = false">{{ LANDING_CTA.demo.label }}</a>
        <NuxtLink :to="LANDING_CTA.register.to" class="lp-btn lp-btn-blue" data-testid="landing-register-company-mobile" @click="open = false">{{ LANDING_CTA.register.label }}</NuxtLink>
      </nav>
    </transition>
  </header>
</template>

<script setup lang="ts">
import LpIcon from './LpIcon.vue'
import { LANDING_CTA, LANDING_NAV } from '~/utils/landing'

/**
 * Cabecera de la landing: fija, translúcida sobre el hero y sólida (con filete
 * y leve sombra) en cuanto se baja. Marca «inmo®» a la izquierda, las secciones
 * en el centro y, a la derecha, «Acceder» y «Solicitar demo». El registro real
 * se ofrece en el menú móvil, en el hero y en el cierre.
 */
const solid = ref(false)
const open = ref(false)
function onScroll() {
  solid.value = window.scrollY > 24
}
onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()
})
onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))
</script>

<style scoped>
.lp-header {
  position: sticky;
  top: 0;
  z-index: 40;
  background: transparent;
  transition: background-color 0.25s, box-shadow 0.25s, backdrop-filter 0.25s;
}
.lp-header.is-solid {
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(18px);
  box-shadow: 0 1px 0 var(--lp-line), 0 10px 30px -26px rgba(16, 19, 25, 0.4);
}
.lp-header-inner {
  display: flex;
  align-items: center;
  gap: 24px;
  min-height: 84px;
}
.lp-nav {
  display: none;
  gap: 27px;
  margin: 0 auto;
  font-size: 13px;
  font-weight: 500;
  color: var(--lp-ink-soft);
}
.lp-nav a {
  padding: 6px 0;
  transition: color 0.2s;
}
.lp-nav a:hover {
  color: var(--lp-blue);
}
.lp-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-left: auto;
}
.lp-login {
  display: none;
  font-size: 13px;
  font-weight: 500;
  color: var(--lp-ink);
}
.lp-login:hover {
  color: var(--lp-blue);
}
.lp-menu-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 10px;
  border: 1px solid var(--lp-line);
  background: var(--lp-paper);
  color: var(--lp-ink);
}
.lp-menu-btn svg {
  width: 20px;
  height: 20px;
}
.lp-mobile {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px clamp(20px, 4vw, 56px) 24px;
  background: #fff;
  border-bottom: 1px solid var(--lp-line);
  box-shadow: 0 16px 24px -18px rgba(16, 19, 25, 0.25);
}
.lp-mobile > a:not(.lp-btn) {
  padding: 12px 2px;
  font-size: 16px;
  font-weight: 500;
  color: var(--lp-ink);
  border-bottom: 1px solid var(--lp-line);
}
.lp-mobile > .lp-btn {
  margin-top: 10px;
}
.lp-fade-enter-active,
.lp-fade-leave-active {
  transition: opacity 0.25s var(--lp-ease), transform 0.25s var(--lp-ease);
}
.lp-fade-enter-from,
.lp-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
@media (min-width: 768px) {
  .lp-login {
    display: inline-flex;
  }
}
@media (min-width: 980px) {
  .lp-nav {
    display: flex;
  }
  .lp-menu-btn,
  .lp-mobile {
    display: none;
  }
}
</style>
