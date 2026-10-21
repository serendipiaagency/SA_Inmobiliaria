<template>
  <footer class="lp-footer" data-testid="landing-footer">
    <div class="lp-shell">
      <div class="lp-footer-top">
        <div class="lp-footer-brand">
          <NuxtLink to="/" class="lp-brand" aria-label="INMO, inicio">inmo<sup>®</sup></NuxtLink>
          <p>{{ LANDING_FOOTER.description }}</p>
        </div>
        <nav v-for="col in LANDING_FOOTER.columns" :key="col.title" class="lp-footer-col" :aria-label="col.title">
          <h3>{{ col.title }}</h3>
          <ul role="list">
            <li v-for="link in col.links" :key="link.href">
              <NuxtLink v-if="link.href.startsWith('/')" :to="link.href">{{ link.label }}</NuxtLink>
              <a v-else :href="link.href">{{ link.label }}</a>
            </li>
          </ul>
        </nav>
      </div>
      <div class="lp-footer-bottom">
        <span>© {{ year }} INMO · Serendipia Agency</span>
        <a href="#" class="lp-footer-top-link">Volver arriba ↑</a>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { LANDING_FOOTER } from '~/utils/landing'

/** Pie comercial de INMO (no el de ninguna inmobiliaria): enlaces de producto, acceso, contacto y legales. */
const year = new Date().getFullYear()
</script>

<style scoped>
.lp-footer {
  padding: clamp(48px, 6vw, 72px) 0 32px;
  background: var(--lp-paper);
  border-top: 1px solid var(--lp-line);
}
.lp-footer-top {
  display: grid;
  grid-template-columns: 2fr repeat(4, 1fr);
  gap: 32px;
}
.lp-footer-brand .lp-brand {
  font-size: 32px;
}
.lp-footer-brand p {
  margin: 16px 0 0;
  max-width: 34ch;
  font-size: 13px;
  line-height: 1.7;
}
.lp-footer-col h3 {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--lp-muted);
}
.lp-footer-col ul {
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 9px;
}
.lp-footer-col a {
  font-size: 13px;
  color: var(--lp-ink-soft);
  overflow-wrap: anywhere;
}
.lp-footer-col a:hover {
  color: var(--lp-blue);
}
.lp-footer-bottom {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px 24px;
  margin-top: 44px;
  padding-top: 24px;
  border-top: 1px solid var(--lp-line);
  font-size: 11px;
  color: var(--lp-muted);
}
.lp-footer-top-link:hover {
  color: var(--lp-blue);
}
@media (max-width: 860px) {
  .lp-footer-top {
    grid-template-columns: 1fr 1fr;
  }
  .lp-footer-brand {
    grid-column: 1 / -1;
  }
}
@media (max-width: 479px) {
  .lp-footer-top {
    grid-template-columns: 1fr;
  }
}
</style>
