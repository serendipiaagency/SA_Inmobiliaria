<template>
  <footer class="lp-footer" data-testid="landing-footer">
    <div class="lp-shell">
      <div class="lp-footer-grid">
        <div class="lp-footer-brand">
          <NuxtLink to="/" class="lp-brand" aria-label="INMO, inicio">
            <span class="lp-brand-mark" aria-hidden="true">I</span>
            <span class="lp-brand-word">INMO</span>
          </NuxtLink>
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
        <p>© {{ year }} INMO · Serendipia Agency. Todos los derechos reservados.</p>
        <p>Plataforma para inmobiliarias. Cada empresa, su espacio.</p>
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
  padding: 64px 0 32px;
  background: var(--lp-paper);
  border-top: 1px solid var(--lp-line);
}
.lp-footer-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) repeat(4, minmax(0, 1fr));
  gap: 32px;
}
.lp-footer-brand p {
  margin: 16px 0 0;
  max-width: 34ch;
  font-size: 14px;
  line-height: 1.6;
}
.lp-footer-col h3 {
  margin: 0;
  font-size: 12px;
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
  gap: 8px;
}
.lp-footer-col a {
  font-size: 14px;
  color: var(--lp-ink-soft);
  text-decoration: none;
  overflow-wrap: anywhere;
}
.lp-footer-col a:hover {
  color: var(--lp-ink);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.lp-footer-bottom {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px 24px;
  margin-top: 48px;
  padding-top: 20px;
  border-top: 1px solid var(--lp-line);
  font-size: 12px;
  color: var(--lp-muted);
}
.lp-footer-bottom p {
  margin: 0;
}
@media (max-width: 1023px) {
  .lp-footer-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .lp-footer-brand {
    grid-column: 1 / -1;
  }
}
@media (max-width: 479px) {
  .lp-footer-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
