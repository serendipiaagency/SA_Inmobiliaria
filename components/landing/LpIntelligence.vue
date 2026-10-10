<template>
  <section id="inteligencia" class="lp-section" data-testid="landing-intelligence">
    <div class="lp-shell">
      <div class="lp-intel-head">
        <p class="lp-eyebrow">Inteligencia inmobiliaria</p>
        <h2 class="lp-h2">Más información para decidir mejor.</h2>
        <p class="lp-lede">Lo que ya puedes usar hoy en INMO, lo que requiere activar la IA y lo que todavía está por llegar. Cada tarjeta lleva su estado real.</p>
      </div>
      <ul class="lp-intel-grid" role="list">
        <li v-for="item in LANDING_INTELLIGENCE" :key="item.key" class="lp-card lp-intel" :class="`is-${item.status}`" :data-testid="`landing-intel-${item.key}`" :data-status="item.status">
          <span class="lp-intel-status">
            <i aria-hidden="true" />{{ LANDING_STATUS_LABEL[item.status] }}
          </span>
          <h3>{{ item.title }}</h3>
          <p>{{ item.text }}</p>
        </li>
      </ul>
      <p class="lp-intel-note">«Con IA activada» significa que la inmobiliaria ha configurado su proveedor de IA en el panel; sin él, el asistente no está disponible.</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { LANDING_INTELLIGENCE, LANDING_STATUS_LABEL } from '~/utils/landing'

/** Sólo capacidades reales, cada una con su estado (docs/landing.md los verifica contra el código). */
</script>

<style scoped>
.lp-intel-head {
  max-width: 720px;
}
.lp-intel-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
  margin: 48px 0 0;
  padding: 0;
  list-style: none;
}
.lp-intel h3 {
  margin: 16px 0 0;
  font-size: 18px;
  line-height: 1.3;
}
.lp-intel p {
  margin: 10px 0 0;
  font-size: 15px;
  line-height: 1.55;
}
.lp-intel-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border-radius: 999px;
  padding: 5px 11px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: var(--lp-sage);
  color: var(--lp-ink);
}
.lp-intel-status i {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #2f7a4f;
}
.is-with-ai .lp-intel-status {
  background: var(--lp-accent-soft);
  color: #8c3522;
}
.is-with-ai .lp-intel-status i {
  background: var(--lp-accent);
}
.is-soon {
  background: var(--lp-paper-2);
}
.is-soon .lp-intel-status {
  background: #e9e4da;
  color: var(--lp-muted);
}
.is-soon .lp-intel-status i {
  background: #a8a195;
}
.lp-intel-note {
  margin: 24px 0 0;
  font-size: 13px;
  color: var(--lp-muted);
}
@media (max-width: 1023px) {
  .lp-intel-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 639px) {
  .lp-intel-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
    margin-top: 32px;
  }
}
</style>
