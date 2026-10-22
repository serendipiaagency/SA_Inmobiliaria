<template>
  <section id="propiedades" class="lp-section lp-props" data-testid="landing-properties">
    <div class="lp-shell">
      <div class="lp-section-top lp-reveal">
        <h2 class="lp-h2">{{ LANDING_PROPERTIES.title[0] }}<br><span>{{ LANDING_PROPERTIES.title[1] }}</span></h2>
        <div>
          <p>{{ LANDING_PROPERTIES.subtitle }}</p>
        </div>
      </div>

      <div
        class="lp-props-stage lp-reveal"
        @mouseenter="paused = true"
        @mouseleave="paused = false"
        @focusin="paused = true"
        @focusout="paused = false"
      >
        <div class="lp-props-chips" role="tablist" aria-label="Aspectos de la gestión de propiedades">
          <button
            v-for="(tab, i) in LANDING_PROPERTIES.tabs"
            :id="`lp-props-tab-${tab.key}`"
            :key="tab.key"
            type="button"
            role="tab"
            class="lp-props-chip"
            :class="{ 'is-active': i === active }"
            :aria-selected="i === active"
            :aria-controls="'lp-props-screen'"
            :tabindex="i === active ? 0 : -1"
            :data-testid="`landing-properties-tab-${tab.key}`"
            :data-active="i === active ? 'true' : 'false'"
            @click="select(i)"
            @keydown.left.prevent="move(-1)"
            @keydown.right.prevent="move(1)"
          >
            <LpIcon name="check" />{{ tab.label }}
          </button>
        </div>

        <div id="lp-props-screen" class="lp-props-screen" role="tabpanel" :aria-labelledby="`lp-props-tab-${current.key}`" data-testid="landing-properties-shot" :data-shot="current.shot">
          <div class="lp-windowbar"><i /><i /><i /><span>{{ ADDR[current.shot] }}</span></div>
          <Transition name="lp-swap" mode="out-in">
            <img :key="shot.src" :src="shot.src" :alt="shot.alt" :width="shot.width" :height="shot.height" loading="lazy" decoding="async">
          </Transition>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import LpIcon from './LpIcon.vue'
import { LANDING_PROPERTIES, LANDING_SHOTS } from '~/utils/landing'

/**
 * Propiedades: cada aspecto de la gestión (seis etiquetas) enseña su pantalla
 * real. Rotan solas cada ~5 s y se pueden elegir a mano; al pulsar una, se
 * reinicia el temporizador para poder verla. Se pausa al pasar el ratón, con
 * el foco dentro, con la pestaña oculta y con «reducir movimiento».
 */
const ADDR: Record<string, string> = {
  'propiedad-panel': 'app.inmo / propiedades',
  panel: 'app.inmo / panel',
  'ficha-publica': 'tu-inmobiliaria.com / propiedad',
  'web-portada': 'tu-inmobiliaria.com',
  'web-contacto': 'tu-inmobiliaria.com / buscar',
  operaciones: 'app.inmo / operaciones',
}
const ROTATE_MS = 5000
const active = ref(0)
const paused = ref(false)
const current = computed(() => LANDING_PROPERTIES.tabs[active.value])
const shot = computed(() => LANDING_SHOTS[current.value.shot])
let reduced = false
let timer: ReturnType<typeof setInterval> | null = null

function start() {
  if (reduced || timer) return
  timer = setInterval(() => {
    if (!paused.value && !document.hidden) active.value = (active.value + 1) % LANDING_PROPERTIES.tabs.length
  }, ROTATE_MS)
}
function restart() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  start()
}
function select(i: number) {
  active.value = i
  restart() // al elegir a mano, reinicia el tiempo para que dé tiempo a verla
}
function move(delta: number) {
  select((active.value + delta + LANDING_PROPERTIES.tabs.length) % LANDING_PROPERTIES.tabs.length)
}
onMounted(() => {
  reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  start()
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.lp-props {
  background: var(--lp-paper);
}
.lp-props-stage {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  gap: clamp(28px, 4vw, 48px);
  align-items: start;
  margin-top: clamp(32px, 4vw, 48px);
}
.lp-props-chips {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.lp-props-chip {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 15px 18px;
  border-radius: 13px;
  border: 1px solid var(--lp-line);
  background: var(--lp-paper-2);
  text-align: left;
  font-size: 14.5px;
  font-weight: 500;
  color: var(--lp-ink-soft);
  transition: background-color 0.3s, border-color 0.3s, color 0.3s, transform 0.3s var(--lp-ease), box-shadow 0.3s;
}
.lp-props-chip :deep(svg) {
  width: 17px;
  height: 17px;
  flex-shrink: 0;
  color: #b9c2cf;
  transition: color 0.3s;
}
.lp-props-chip:hover {
  border-color: #c7dcfb;
}
.lp-props-chip.is-active {
  background: var(--lp-ink);
  border-color: var(--lp-ink);
  color: #fff;
  transform: translateX(4px);
  box-shadow: 0 16px 34px -22px rgba(16, 19, 25, 0.5);
}
.lp-props-chip.is-active :deep(svg) {
  color: var(--lp-blue);
}
.lp-props-screen {
  position: relative;
  border-radius: 12px;
  border: 1px solid var(--lp-line);
  overflow: hidden;
  background: #fff;
  box-shadow: 0 30px 70px -44px rgba(32, 59, 92, 0.4);
}
.lp-windowbar {
  display: flex;
  gap: 5px;
  align-items: center;
  padding: 12px 14px;
  background: #f4f6f9;
  border-bottom: 1px solid var(--lp-line);
  font-size: 10px;
  color: var(--lp-muted);
}
.lp-windowbar i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #d7dce3;
}
.lp-windowbar span {
  margin-left: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.lp-props-screen img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 1.6;
  object-fit: cover;
  object-position: top;
}
@media (max-width: 860px) {
  .lp-props-stage {
    grid-template-columns: 1fr;
    gap: 22px;
  }
  .lp-props-chips {
    flex-direction: row;
    flex-wrap: wrap;
  }
  .lp-props-chip {
    width: auto;
    flex: 1 1 calc(50% - 10px);
  }
  .lp-props-chip.is-active {
    transform: none;
  }
}
@media (max-width: 479px) {
  .lp-props-chip {
    flex-basis: 100%;
  }
}
</style>
