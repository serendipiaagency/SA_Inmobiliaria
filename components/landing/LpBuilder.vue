<template>
  <section id="constructor-web" class="lp-section lp-builder" data-testid="landing-builder">
    <div class="lp-shell">
      <div class="lp-section-top lp-reveal">
        <h2 class="lp-h2">{{ LANDING_BUILDER.title[0] }}<br><span>{{ LANDING_BUILDER.title[1] }}</span></h2>
        <div>
          <p>{{ LANDING_BUILDER.subtitle }}</p>
          <a :href="LANDING_BUILDER.cta.to" class="lp-text-link">{{ LANDING_BUILDER.cta.label }} <LpIcon name="arrow" /></a>
        </div>
      </div>

      <div class="lp-builder-stage lp-reveal">
        <div class="lp-stage-toolbar">
          <strong>{{ LANDING_BUILDER.stageTitle }}</strong>
          <div class="lp-segmented" role="tablist" aria-label="Vista del Constructor Web">
            <button
              v-for="tab in LANDING_BUILDER.tabs"
              :id="`lp-builder-tab-${tab.key}`"
              :key="tab.key"
              type="button"
              role="tab"
              class="lp-seg-btn"
              :class="{ 'is-selected': active === tab.key }"
              :aria-selected="active === tab.key"
              :aria-controls="`lp-builder-panel-${tab.key}`"
              :tabindex="active === tab.key ? 0 : -1"
              :data-testid="`landing-builder-tab-${tab.key}`"
              @click="active = tab.key"
              @keydown.left.right.prevent="toggle"
            >
              {{ tab.label }}
            </button>
          </div>
        </div>

        <div :id="`lp-builder-panel-${current.key}`" role="tabpanel" :aria-labelledby="`lp-builder-tab-${current.key}`" class="lp-screen" data-testid="landing-builder-shot" :data-shot="current.shot">
          <Transition name="lp-swap" mode="out-in">
            <img
              :key="current.shot"
              :src="shot.src"
              :alt="shot.alt"
              :width="shot.width"
              :height="shot.height"
              loading="lazy"
              decoding="async"
            >
          </Transition>
          <div v-if="active === 'editor'" class="lp-selection-frame" aria-hidden="true"><span>Diseñado por ti</span></div>
        </div>

        <div class="lp-floating-tag"><span class="lp-dot" aria-hidden="true" /> Tu catálogo, conectado</div>
      </div>

      <ol class="lp-steps3 lp-reveal">
        <li v-for="(step, i) in LANDING_BUILDER.steps" :key="step.title">
          <b>0{{ i + 1 }}</b>
          <h3>{{ step.title }}</h3>
          <p>{{ step.text }}</p>
        </li>
      </ol>
    </div>
  </section>
</template>

<script setup lang="ts">
import LpIcon from './LpIcon.vue'
import { LANDING_BUILDER, LANDING_SHOTS } from '~/utils/landing'

/**
 * Constructor Web: las dos caras reales del mismo sitio (el editor visual y la
 * web publicada), capturas de la cuenta de demostración, que se alternan con
 * transición suave al elegir la pestaña.
 */
type TabKey = (typeof LANDING_BUILDER.tabs)[number]['key']
const active = ref<TabKey>('editor')
const current = computed(() => LANDING_BUILDER.tabs.find((t) => t.key === active.value) || LANDING_BUILDER.tabs[0])
const shot = computed(() => LANDING_SHOTS[current.value.shot as keyof typeof LANDING_SHOTS])
function toggle() {
  active.value = active.value === 'editor' ? 'web' : 'editor'
}
</script>

<style scoped>
.lp-builder {
  background: radial-gradient(ellipse at 50% 62%, #e1edfc, transparent 70%), var(--lp-paper-2);
  border-top: 1px solid var(--lp-line);
}
.lp-builder-stage {
  position: relative;
  padding: 13px;
  background: #fff;
  border: 1px solid #d8e0e9;
  border-radius: 16px;
  box-shadow: 0 30px 80px -40px rgba(32, 59, 92, 0.3);
}
.lp-stage-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 15px;
  padding: 8px 10px 20px;
  font-size: 12px;
}
.lp-stage-toolbar strong {
  color: var(--lp-ink);
}
.lp-segmented {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 8px;
  background: #f0f2f5;
}
.lp-seg-btn {
  padding: 10px 16px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  font-size: 11px;
  font-weight: 600;
  color: var(--lp-ink-soft);
  transition: background-color 0.25s, color 0.25s;
}
.lp-seg-btn.is-selected {
  background: var(--lp-ink);
  color: #fff;
}
.lp-screen {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--lp-line);
  border-radius: 8px;
}
.lp-screen img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 1.8;
  object-fit: cover;
  object-position: top;
}
.lp-selection-frame {
  position: absolute;
  pointer-events: none;
  left: 26%;
  right: 24%;
  top: 26%;
  bottom: 26%;
  border: 1px solid var(--lp-blue);
  animation: lp-select 7s infinite;
}
.lp-selection-frame span {
  position: absolute;
  top: -22px;
  left: -1px;
  background: var(--lp-blue);
  color: #fff;
  padding: 5px 8px;
  font-size: 10px;
}
@keyframes lp-select {
  0%, 20%, 100% {
    opacity: 0;
    transform: scale(0.98);
  }
  35%, 80% {
    opacity: 1;
    transform: scale(1);
  }
}
.lp-floating-tag {
  position: absolute;
  right: -16px;
  bottom: 58px;
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 15px 19px;
  background: #fff;
  border: 1px solid var(--lp-line);
  border-radius: 8px;
  font-size: 11px;
  box-shadow: 0 14px 28px -14px rgba(16, 19, 25, 0.3);
  animation: lp-float 6s ease-in-out infinite;
}
.lp-steps3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: clamp(28px, 4vw, 60px);
  margin: 0;
  padding: clamp(36px, 5vw, 48px) 0 0;
  list-style: none;
}
.lp-steps3 b {
  font-size: 11px;
  color: var(--lp-blue);
}
.lp-steps3 h3 {
  margin: 12px 0 8px;
  font-size: 20px;
  letter-spacing: -0.02em;
  font-weight: 600;
}
.lp-steps3 p {
  margin: 0;
  max-width: 270px;
  font-size: 13px;
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
  .lp-stage-toolbar {
    flex-direction: column;
    align-items: flex-start;
    padding: 5px 0 12px;
  }
  .lp-segmented {
    width: 100%;
  }
  .lp-seg-btn {
    flex: 1;
  }
  .lp-screen img {
    aspect-ratio: 1.3;
    object-position: left top;
  }
  .lp-floating-tag {
    right: 0;
    bottom: 20px;
    padding: 11px 13px;
    font-size: 10px;
  }
  .lp-steps3 {
    grid-template-columns: 1fr;
    gap: 22px;
  }
  .lp-steps3 li {
    border-bottom: 1px solid #dde3eb;
    padding-bottom: 18px;
  }
  .lp-steps3 p {
    max-width: none;
  }
}
</style>
