<template>
  <section id="crm" class="lp-section lp-crm lp-dark" data-testid="landing-crm">
    <div class="lp-shell">
      <div class="lp-section-top lp-reveal">
        <h2 class="lp-h2">{{ LANDING_CRM.title[0] }}<br><span>{{ LANDING_CRM.title[1] }}</span></h2>
        <div>
          <p>{{ LANDING_CRM.subtitle }}</p>
          <a :href="LANDING_CRM.cta.to" class="lp-text-link">{{ LANDING_CRM.cta.label }} <LpIcon name="arrow" /></a>
        </div>
      </div>

      <div class="lp-crm-stage lp-reveal" data-testid="landing-crm-flow" @mouseenter="paused = true" @mouseleave="paused = false">
        <div class="lp-crm-context">
          <span class="lp-orb" aria-hidden="true">↗</span>
          <h3>{{ LANDING_CRM.contextTitle[0] }}<br>{{ LANDING_CRM.contextTitle[1] }}</h3>
          <div class="lp-crm-steps">
            <button
              v-for="(step, i) in LANDING_CRM.steps"
              :key="step.label"
              type="button"
              class="lp-crm-step"
              :class="{ 'is-active': i === active }"
              :data-testid="`landing-crm-step-${i + 1}`"
              :data-active="i === active ? 'true' : 'false'"
              :aria-pressed="i === active"
              @click="select(i)"
            >
              <span class="lp-crm-step-num">0{{ i + 1 }}</span>
              <span class="lp-crm-step-label">{{ step.label }}</span>
              <i aria-hidden="true">↗</i>
            </button>
          </div>
          <p class="lp-crm-desc lp-flow-note">{{ LANDING_CRM.steps[active].desc }}</p>
        </div>

        <div class="lp-crm-screen">
          <div class="lp-windowbar"><i /><i /><i /><span>INMO / CRM inmobiliario</span></div>
          <img :src="shot.src" :alt="shot.alt" :width="shot.width" :height="shot.height" loading="lazy" decoding="async">
          <div class="lp-crm-notification">
            <span class="lp-dot" aria-hidden="true" />
            <div>
              <b>{{ LANDING_CRM.steps[active].noticeTitle }}</b>
              <small>{{ LANDING_CRM.steps[active].noticeText }}</small>
            </div>
            <span class="lp-crm-check" aria-hidden="true">✓</span>
          </div>
        </div>
      </div>

      <div class="lp-crm-footer">
        <span v-for="f in LANDING_CRM.footer" :key="f">{{ f }}</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import LpIcon from './LpIcon.vue'
import { LANDING_CRM, LANDING_SHOTS } from '~/utils/landing'

/**
 * CRM: la captura real del listado de leads y, a su lado, una microdemo del
 * recorrido real de una consulta. Avanza sola cada pocos segundos, se para al
 * pasar el ratón y respeta «reducir movimiento».
 */
const shot = LANDING_SHOTS.crm
const active = ref(0)
const paused = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

function select(i: number) {
  active.value = i
}
onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  timer = setInterval(() => {
    if (!paused.value && !document.hidden) active.value = (active.value + 1) % LANDING_CRM.steps.length
  }, 3200)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.lp-crm {
  background: var(--lp-dark);
  color: #c7ced9;
  overflow: hidden;
}
.lp-crm :deep(.lp-h2) {
  color: #fff;
}
.lp-crm :deep(.lp-h2 span) {
  color: #71adff;
}
.lp-crm .lp-section-top p {
  color: #a3a9b4;
}
.lp-crm :deep(.lp-text-link) {
  color: #fff;
}
.lp-crm :deep(.lp-text-link:hover) {
  color: #71adff;
}
.lp-crm h3 {
  color: #fff;
}
.lp-crm-stage {
  display: grid;
  grid-template-columns: 0.85fr 1.6fr;
  gap: clamp(32px, 4vw, 50px);
  align-items: center;
}
.lp-orb {
  display: inline-grid;
  place-content: center;
  width: 48px;
  height: 48px;
  background: rgba(8, 124, 250, 0.13);
  border: 1px solid rgba(8, 124, 250, 0.4);
  border-radius: 12px;
  color: #7bb5ff;
  font-size: 26px;
}
.lp-crm-context h3 {
  margin: 20px 0 30px;
  font-size: 25px;
  line-height: 1.4;
  font-weight: 600;
}
.lp-crm-steps {
  display: grid;
}
.lp-crm-step {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  padding: 18px 0;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: none;
  text-align: left;
  color: #717985;
  font-size: 11px;
  transition: color 0.4s;
}
.lp-crm-step-num {
  font-weight: 700;
}
.lp-crm-step-label {
  flex: 1;
  font-size: 12px;
}
.lp-crm-step i {
  font-style: normal;
}
.lp-crm-step.is-active {
  color: #7cb5ff;
}
.lp-crm-desc {
  margin: 20px 0 0;
  min-height: 56px;
  font-size: 12.5px;
  line-height: 1.6;
  color: #9aa3b2;
}
.lp-crm-screen {
  position: relative;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 0 90px rgba(8, 124, 250, 0.13);
  transform: perspective(1400px) rotateY(-5deg);
  transition: transform 0.8s var(--lp-ease);
  background: #fff;
}
.lp-crm-screen:hover {
  transform: perspective(1400px) rotateY(0);
}
.lp-windowbar {
  display: flex;
  gap: 5px;
  align-items: center;
  padding: 13px;
  background: var(--lp-dark-2);
  border-radius: 12px 12px 0 0;
  font-size: 10px;
  color: #a6afbc;
}
.lp-windowbar i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #5e6774;
}
.lp-windowbar span {
  margin: auto;
}
.lp-crm-screen img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 1.6;
  object-fit: cover;
  object-position: top;
  border-radius: 0 0 12px 12px;
}
.lp-crm-notification {
  position: absolute;
  right: -18px;
  bottom: 26px;
  display: flex;
  gap: 16px;
  align-items: center;
  min-width: 270px;
  padding: 18px 20px;
  background: #fff;
  color: #13171d;
  border: 1px solid #d7e4f7;
  border-radius: 9px;
  box-shadow: 0 15px 45px rgba(0, 0, 0, 0.22);
  animation: lp-float 5s ease-in-out infinite;
}
.lp-crm-notification b {
  font-size: 12px;
}
.lp-crm-notification small {
  display: block;
  margin-top: 5px;
  font-size: 10px;
  color: #777;
}
.lp-crm-check {
  margin-left: auto;
  color: var(--lp-blue);
}
.lp-crm-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 16px 24px;
  margin-top: 30px;
  padding-top: 30px;
  border-top: 1px solid rgba(255, 255, 255, 0.13);
  font-size: 11px;
  color: #a8b0bd;
}
@media (max-width: 860px) {
  .lp-crm-stage {
    grid-template-columns: 1fr;
    gap: 24px;
  }
  .lp-crm-desc {
    min-height: 40px;
  }
  .lp-crm-screen {
    transform: none;
    margin-right: 10px;
  }
  .lp-crm-notification {
    min-width: 230px;
    right: -10px;
    bottom: 14px;
    padding: 13px 15px;
  }
  .lp-crm-footer {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
  }
}
</style>
