<template>
  <section id="faq" class="lp-section lp-faq" data-testid="landing-faq">
    <div class="lp-shell lp-faq-inner">
      <h2 class="lp-h2">Las cosas claras.<br><span>Desde el principio.</span></h2>
      <div class="lp-faq-list">
        <details v-for="(f, i) in LANDING_FAQ" :key="f.q" class="lp-faq-item" :data-testid="`landing-faq-item-${i + 1}`" :open="i === 0 || undefined">
          <summary>{{ f.q }}</summary>
          <div class="lp-faq-answer"><p>{{ f.a }}</p></div>
        </details>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { LANDING_FAQ } from '~/utils/landing'

/** Preguntas frecuentes con respuestas honestas (lo que hay y lo que no); `details` nativo, accesible y sin JS. */
</script>

<style scoped>
.lp-faq {
  background: var(--lp-paper);
  border-top: 1px solid var(--lp-line);
}
.lp-faq-inner {
  display: grid;
  grid-template-columns: 1fr 1.3fr;
  gap: clamp(32px, 6vw, 80px);
  align-items: start;
}
.lp-faq .lp-h2 {
  font-size: clamp(28px, 3.2vw, 38px);
  position: sticky;
  top: 110px;
}
.lp-faq-list {
  display: grid;
}
.lp-faq-item {
  border-bottom: 1px solid var(--lp-line);
}
.lp-faq-item summary {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 20px 0;
  cursor: pointer;
  list-style: none;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.6;
  color: var(--lp-ink);
}
.lp-faq-item summary::-webkit-details-marker {
  display: none;
}
.lp-faq-item summary::after {
  content: '+';
  margin-left: auto;
  font-size: 24px;
  font-weight: 400;
  color: #747b84;
}
.lp-faq-item[open] summary {
  color: var(--lp-blue);
}
.lp-faq-item[open] summary::after {
  content: '−';
  color: var(--lp-blue);
}
.lp-faq-answer {
  animation: lp-detail-open 0.4s var(--lp-ease);
}
.lp-faq-item p {
  margin: 0;
  padding: 0 30px 22px 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--lp-muted);
}
@keyframes lp-detail-open {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@media (max-width: 860px) {
  .lp-faq-inner {
    grid-template-columns: 1fr;
    gap: 24px;
  }
  .lp-faq .lp-h2 {
    position: static;
  }
}
</style>
