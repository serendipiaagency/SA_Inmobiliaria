<template>
  <header class="lp-header" :class="{ 'is-solid': solid || open }" data-testid="landing-header">
    <div class="lp-shell lp-header-inner">
      <NuxtLink to="/" class="lp-brand" aria-label="INMO, inicio">
        <span class="lp-brand-mark" aria-hidden="true">I</span>
        <span class="lp-brand-word">INMO</span>
      </NuxtLink>

      <nav class="lp-nav" aria-label="Secciones de la página">
        <a v-for="item in LANDING_NAV" :key="item.href" :href="item.href" :data-nav="item.href.slice(1)">{{ item.label }}</a>
      </nav>

      <div class="lp-actions">
        <NuxtLink :to="LANDING_CTA.login.to" class="lp-login" data-testid="landing-login">{{ LANDING_CTA.login.label }}</NuxtLink>
        <a :href="LANDING_CTA.demo.to" class="lp-btn lp-btn-ghost lp-btn-sm lp-demo" data-testid="landing-demo">{{ LANDING_CTA.demo.label }}</a>
        <NuxtLink :to="LANDING_CTA.register.to" class="lp-btn lp-btn-accent lp-btn-sm" data-testid="landing-register-company" data-landing-event="cta_register_header">{{ LANDING_CTA.register.label }}</NuxtLink>
        <button type="button" class="lp-menu-btn" :aria-expanded="open" aria-controls="lp-mobile-nav" :aria-label="open ? 'Cerrar menú' : 'Abrir menú'" data-testid="landing-menu" @click="open = !open">
          <LpIcon :name="open ? 'close' : 'menu'" />
        </button>
      </div>
    </div>

    <transition name="lp-fade">
      <nav v-if="open" id="lp-mobile-nav" class="lp-mobile" aria-label="Menú" data-testid="landing-mobile-nav">
        <a v-for="item in LANDING_NAV" :key="item.href" :href="item.href" @click="open = false">{{ item.label }}</a>
        <a :href="LANDING_CTA.demo.to" @click="open = false">{{ LANDING_CTA.demo.label }}</a>
        <NuxtLink :to="LANDING_CTA.login.to" @click="open = false">{{ LANDING_CTA.login.label }}</NuxtLink>
        <NuxtLink :to="LANDING_CTA.register.to" class="lp-btn lp-btn-accent" data-testid="landing-register-company-mobile" @click="open = false">{{ LANDING_CTA.register.label }}</NuxtLink>
      </nav>
    </transition>
  </header>
</template>

<script setup lang="ts">
import LpIcon from './LpIcon.vue'
import { LANDING_CTA, LANDING_NAV } from '~/utils/landing'

/**
 * Cabecera de la landing: fija, transparente sobre el Hero y sólida (con una
 * sombra discreta) en cuanto se hace scroll. Logo de INMO a la izquierda, las
 * secciones en el centro y, a la derecha, «Iniciar sesión», «Solicitar demo»
 * y el botón principal «Crear mi inmobiliaria» (el flujo real de registro).
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
  z-index: 50;
  background: transparent;
  transition: background-color 0.25s, box-shadow 0.25s, backdrop-filter 0.25s;
}
.lp-header.is-solid {
  background: rgba(251, 249, 245, 0.88);
  backdrop-filter: blur(12px);
  box-shadow: 0 1px 0 var(--lp-line), 0 10px 30px -24px rgba(23, 44, 34, 0.3);
}
.lp-header-inner {
  display: flex;
  align-items: center;
  gap: 24px;
  min-height: 72px;
}
.lp-nav {
  display: none;
  gap: 26px;
  margin: 0 auto;
  font-size: 14px;
  font-weight: 600;
  color: var(--lp-ink-soft);
}
.lp-nav a {
  text-decoration: none;
  padding: 6px 0;
  border-bottom: 1.5px solid transparent;
  transition: color 0.2s, border-color 0.2s;
}
.lp-nav a:hover {
  color: var(--lp-ink);
  border-color: var(--lp-accent);
}
.lp-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}
.lp-login {
  display: none;
  font-size: 14px;
  font-weight: 600;
  color: var(--lp-ink);
  text-decoration: none;
  padding: 8px 10px;
}
.lp-login:hover {
  text-decoration: underline;
  text-underline-offset: 4px;
}
.lp-demo {
  display: none;
}
.lp-menu-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  border: 1px solid var(--lp-line);
  background: var(--lp-white);
  color: var(--lp-ink);
}
.lp-menu-btn svg {
  width: 20px;
  height: 20px;
}
.lp-mobile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 24px 20px;
  background: var(--lp-paper);
  border-bottom: 1px solid var(--lp-line);
}
.lp-mobile > a {
  padding: 12px 4px;
  font-size: 16px;
  font-weight: 600;
  color: var(--lp-ink);
  text-decoration: none;
  border-bottom: 1px solid var(--lp-line);
}
.lp-mobile > a.lp-btn {
  margin-top: 12px;
  border-bottom: 0;
  color: #fff;
}
@media (min-width: 768px) {
  .lp-login,
  .lp-demo {
    display: inline-flex;
  }
}
@media (min-width: 1024px) {
  .lp-nav {
    display: flex;
  }
  .lp-menu-btn,
  .lp-mobile {
    display: none;
  }
}
</style>
