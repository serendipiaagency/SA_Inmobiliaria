<template>
  <SiteBlockRenderer v-if="isPortal" :blocks="page?.blocks || []" :styles="page?.styles || null" :home-data="data" mode="production" />
  <div v-else class="sa-landing" data-testid="landing">
    <LpHeader />
    <main>
      <LpHero />
      <LpModules />
      <LpBuilder />
      <LpCrm />
      <LpProperties />
      <LpIntelligence />
      <LpFeatures />
      <LpHowItWorks />
      <LpDemo />
      <LpAccess />
      <LpFaq />
      <LpFinal />
    </main>
    <LpFooter />
  </div>
</template>

<script setup lang="ts">
import SiteBlockRenderer from '~/components/site-builder/SiteBlockRenderer.vue'
import LpHeader from '~/components/landing/LpHeader.vue'
import LpHero from '~/components/landing/LpHero.vue'
import LpModules from '~/components/landing/LpModules.vue'
import LpBuilder from '~/components/landing/LpBuilder.vue'
import LpCrm from '~/components/landing/LpCrm.vue'
import LpProperties from '~/components/landing/LpProperties.vue'
import LpIntelligence from '~/components/landing/LpIntelligence.vue'
import LpFeatures from '~/components/landing/LpFeatures.vue'
import LpHowItWorks from '~/components/landing/LpHowItWorks.vue'
import LpDemo from '~/components/landing/LpDemo.vue'
import LpAccess from '~/components/landing/LpAccess.vue'
import LpFaq from '~/components/landing/LpFaq.vue'
import LpFinal from '~/components/landing/LpFinal.vue'
import LpFooter from '~/components/landing/LpFooter.vue'
import { LANDING_FAQ, LANDING_HERO, LANDING_SHOTS } from '~/utils/landing'

// "/" is host-aware (see server/api/public/tenant.get.ts): the primary/default
// host keeps this SaaS marketing landing page, while a resolved tenant custom
// domain gets that org's own real-estate portal home instead. definePageMeta
// can't branch at runtime, so both branches live in this one page under the
// 'root' layout (layouts/root.vue), which does the equivalent branching for
// the surrounding chrome (site header/footer vs. none).
definePageMeta({ layout: 'root', transparentHero: true })

// Eventos de analítica de la landing: sólo si ya hay un GA4 cargado con
// consentimiento (plugins/consent-scripts.client.ts); nunca se carga nada
// desde aquí. Cada botón con `data-landing-event` envía su nombre al hacer clic.
onMounted(() => {
  const root = document.querySelector('.sa-landing')
  if (!root) return
  root.addEventListener('click', (ev) => {
    const el = (ev.target as HTMLElement | null)?.closest<HTMLElement>('[data-landing-event]')
    const name = el?.dataset.landingEvent
    const gtag = (window as any).gtag
    if (name && typeof gtag === 'function') gtag('event', name, { event_category: 'landing' })
  })
})

const { tenant, load: loadTenant } = useTenant()
await loadTenant()
const isPortal = computed(() => tenant.value?.isCustomDomain === true)

let data = ref<any>(null)
let page = ref<any>(null)
if (isPortal.value) {
  ;({ data } = await useFetch('/api/public/home'))
  ;({ data: page } = await useFetch('/api/public/site-pages/home'))
}

if (isPortal.value) {
  useHead(
    seoHead({
      title: page.value?.seo?.title || `${tenant.value?.companyName || tenant.value?.name} — Propiedades excepcionales`,
      description:
        page.value?.seo?.description ||
        'Marketplace curado de proyectos off-plan, ventas de segunda mano y comunidades residenciales.',
    }),
  )
} else {
  // La landing comercial de INMO (utils/landing.ts): SEO completo con la
  // captura real del panel como imagen social, canónica en el host principal
  // y datos estructurados del producto y de las preguntas frecuentes.
  const url = useRequestURL()
  const origin = `${url.protocol}//${url.host}`
  const title = 'INMO — Tu inmobiliaria, toda conectada'
  const description = `${LANDING_HERO.subtitle} Crea tu web, organiza tus contactos, coordina visitas y sigue cada operación con tu equipo.`
  const image = `${origin}${LANDING_SHOTS.panel.src}`
  useHead({
    htmlAttrs: { lang: 'es', dir: 'ltr' },
    title,
    meta: [
      { name: 'description', content: description },
      { name: 'robots', content: 'index, follow' },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'INMO' },
      { property: 'og:locale', content: 'es_ES' },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: `${origin}/` },
      { property: 'og:image', content: image },
      { property: 'og:image:width', content: String(LANDING_SHOTS.panel.width) },
      { property: 'og:image:height', content: String(LANDING_SHOTS.panel.height) },
      { property: 'og:image:alt', content: LANDING_SHOTS.panel.alt },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: image },
    ],
    link: [{ rel: 'canonical', href: `${origin}/` }],
    script: [
      {
        type: 'application/ld+json',
        innerHTML: JSON.stringify([
          {
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'INMO',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            description,
            url: `${origin}/`,
            image,
            inLanguage: 'es',
            offers: { '@type': 'Offer', availability: 'https://schema.org/PreOrder', description: 'Planes y precios bajo consulta' },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: LANDING_FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
          },
        ]),
      },
    ],
  })
}
</script>

<style>
/*
 * Sistema visual de la landing comercial de INMO (sin ámbito: lo comparten
 * las secciones de components/landing/*). Tokens de la marca de la plataforma
 * (los de la plantilla de email «Portal INMO»): verde petróleo, blanco cálido
 * y un coral como acento, usado con mesura. Tipografía Inter, la global, sin
 * cargar más fuentes.
 */
.sa-landing {
  --lp-ink: #172c22;
  --lp-ink-soft: #3f5146;
  --lp-text: #4f5b53;
  --lp-muted: #7a857a;
  --lp-paper: #fbf9f5;
  --lp-paper-2: #f3efe7;
  --lp-white: #ffffff;
  --lp-line: #e6e1d7;
  --lp-accent: #cc553f;
  --lp-accent-soft: #fbe9e2;
  --lp-sage: #e1e8dc;
  --lp-radius: 20px;
  --lp-shadow: 0 24px 60px -32px rgba(23, 44, 34, 0.35);
  --lp-ease: cubic-bezier(0.22, 1, 0.36, 1);
  background: var(--lp-paper);
  color: var(--lp-text);
  font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
  overflow-x: clip;
}
.sa-landing :where(h1, h2, h3, h4) {
  color: var(--lp-ink);
  letter-spacing: -0.02em;
  font-weight: 700;
}
.sa-landing :where(a) {
  color: inherit;
}
.sa-landing :where(a, button):focus-visible {
  outline: 2px solid var(--lp-accent);
  outline-offset: 3px;
  border-radius: 8px;
}
.lp-shell {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
}
.lp-section {
  padding: 96px 0;
}
.lp-section-tight {
  padding: 72px 0;
}
.lp-dark {
  background: var(--lp-ink);
  color: #d7e0d8;
}
.lp-dark :where(h1, h2, h3) {
  color: #fff;
}
.lp-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 999px;
  background: var(--lp-sage);
  color: var(--lp-ink);
  padding: 6px 14px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.lp-dark .lp-eyebrow {
  background: rgba(255, 255, 255, 0.1);
  color: #e6efe5;
}
.lp-h2 {
  font-size: clamp(30px, 4vw, 46px);
  line-height: 1.08;
  margin: 18px 0 0;
  max-width: 18ch;
}
.lp-lede {
  font-size: 18px;
  line-height: 1.6;
  margin: 18px 0 0;
  max-width: 58ch;
}
.lp-dark .lp-lede {
  color: #c2cec4;
}
.lp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 50px;
  padding: 0 24px;
  border-radius: 999px;
  font-size: 15px;
  font-weight: 600;
  line-height: 1;
  border: 1px solid transparent;
  transition: transform 0.2s var(--lp-ease), background-color 0.2s, color 0.2s, border-color 0.2s, box-shadow 0.2s;
  cursor: pointer;
  text-decoration: none;
}
.lp-btn:hover {
  transform: translateY(-1px);
}
.lp-btn:active {
  transform: translateY(0) scale(0.98);
}
.lp-btn-primary {
  background: var(--lp-ink);
  color: #fff;
  box-shadow: 0 14px 30px -16px rgba(23, 44, 34, 0.6);
}
.lp-btn-primary:hover {
  background: #0f1f17;
}
.lp-btn-accent {
  background: var(--lp-accent);
  color: #fff;
  box-shadow: 0 14px 30px -16px rgba(204, 85, 63, 0.6);
}
.lp-btn-accent:hover {
  background: #b8472f;
}
.lp-btn-ghost {
  background: var(--lp-white);
  color: var(--lp-ink);
  border-color: var(--lp-line);
}
.lp-btn-ghost:hover {
  border-color: var(--lp-ink);
}
.lp-dark .lp-btn-ghost {
  background: transparent;
  color: #fff;
  border-color: rgba(255, 255, 255, 0.35);
}
.lp-dark .lp-btn-ghost:hover {
  border-color: #fff;
}
.lp-btn-sm {
  min-height: 42px;
  padding: 0 18px;
  font-size: 14px;
}
/* Marca INMO (cabecera y pie) */
.lp-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
}
.lp-brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--lp-ink);
  color: #fff;
  font-weight: 800;
  font-size: 17px;
}
.lp-brand-word {
  font-weight: 800;
  font-size: 19px;
  letter-spacing: -0.03em;
  color: var(--lp-ink);
}
/* Marco de navegador para las capturas reales */
.lp-browser {
  border-radius: 18px;
  background: var(--lp-white);
  border: 1px solid var(--lp-line);
  box-shadow: var(--lp-shadow);
  overflow: hidden;
}
.lp-browser-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--lp-line);
  background: #f7f4ee;
}
.lp-browser-bar i {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #ded8cc;
}
.lp-browser-bar span {
  margin-left: 8px;
  flex: 1;
  height: 22px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid var(--lp-line);
  font-size: 11px;
  color: var(--lp-muted);
  display: flex;
  align-items: center;
  padding: 0 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.lp-shot {
  display: block;
  width: 100%;
  height: auto;
  background: var(--lp-paper-2);
}
.lp-shot-missing {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 16 / 10;
  padding: 24px;
  text-align: center;
  font-size: 13px;
  color: var(--lp-muted);
  background: repeating-linear-gradient(135deg, #f3efe7 0 12px, #efeadf 12px 24px);
}
/* Tarjetas */
.lp-card {
  background: var(--lp-white);
  border: 1px solid var(--lp-line);
  border-radius: var(--lp-radius);
  padding: 28px;
  transition: transform 0.25s var(--lp-ease), box-shadow 0.25s, border-color 0.25s;
}
.lp-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--lp-shadow);
  border-color: #d6d0c3;
}
.lp-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: var(--lp-sage);
  color: var(--lp-ink);
}
.lp-icon svg {
  width: 22px;
  height: 22px;
}
/* Pestañas */
.lp-tabs {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: var(--lp-paper-2);
  border: 1px solid var(--lp-line);
}
.lp-tab {
  min-height: 40px;
  padding: 0 18px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  color: var(--lp-text);
  transition: background-color 0.2s, color 0.2s, box-shadow 0.2s;
}
.lp-tab[aria-selected='true'] {
  background: var(--lp-white);
  color: var(--lp-ink);
  box-shadow: 0 2px 10px -4px rgba(0, 0, 0, 0.25);
}
.lp-fade-enter-active,
.lp-fade-leave-active {
  transition: opacity 0.3s var(--lp-ease), transform 0.3s var(--lp-ease);
}
.lp-fade-enter-from,
.lp-fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
@media (max-width: 767px) {
  .lp-section {
    padding: 64px 0;
  }
  .lp-section-tight {
    padding: 48px 0;
  }
  .lp-card {
    padding: 22px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .sa-landing *,
  .sa-landing *::before,
  .sa-landing *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
</style>
