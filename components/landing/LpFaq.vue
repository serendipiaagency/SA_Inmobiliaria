<template>
  <section id="faq" class="lp-section lp-faq" data-testid="landing-faq">
    <div class="lp-shell lp-faq-inner">
      <div class="lp-faq-head">
        <p class="lp-eyebrow">Preguntas frecuentes</p>
        <h2 class="lp-h2">Lo que suelen preguntarnos.</h2>
        <p class="lp-lede">Si no encuentras tu pregunta, escríbenos a <a href="mailto:info@serendipiaagency.com">info@serendipiaagency.com</a>.</p>
      </div>
      <div class="lp-faq-list">
        <details v-for="(f, i) in LANDING_FAQ" :key="f.q" class="lp-faq-item" :data-testid="`landing-faq-item-${i + 1}`" :open="i === 0 ? true : undefined">
          <summary>
            <span>{{ f.q }}</span>
            <LpIcon name="chevron" />
          </summary>
          <p>{{ f.a }}</p>
        </details>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import LpIcon from './LpIcon.vue'
import { LANDING_FAQ } from '~/utils/landing'

/** Diez preguntas con respuestas honestas (lo que hay y lo que no); `details` nativo: accesible y sin JS. */
</script>

<style scoped>
.lp-faq {
  background: var(--lp-paper-2);
}
.lp-faq-inner {
  display: grid;
  grid-template-columns: minmax(0, 4fr) minmax(0, 7fr);
  gap: 48px;
  align-items: start;
}
.lp-faq-head {
  position: sticky;
  top: 96px;
}
.lp-faq-head a {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.lp-faq-list {
  display: grid;
  gap: 10px;
}
.lp-faq-item {
  border-radius: 16px;
  background: var(--lp-white);
  border: 1px solid var(--lp-line);
  transition: border-color 0.2s;
}
.lp-faq-item[open] {
  border-color: #cfc8ba;
}
.lp-faq-item summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  cursor: pointer;
  list-style: none;
  font-size: 16px;
  font-weight: 600;
  color: var(--lp-ink);
}
.lp-faq-item summary::-webkit-details-marker {
  display: none;
}
.lp-faq-item summary svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  transition: transform 0.25s var(--lp-ease);
}
.lp-faq-item[open] summary svg {
  transform: rotate(180deg);
}
.lp-faq-item p {
  margin: 0;
  padding: 0 20px 20px;
  font-size: 15px;
  line-height: 1.6;
}
@media (max-width: 1023px) {
  .lp-faq-inner {
    grid-template-columns: minmax(0, 1fr);
    gap: 28px;
  }
  .lp-faq-head {
    position: static;
  }
}
</style>
