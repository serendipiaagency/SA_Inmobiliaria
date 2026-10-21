<template>
  <SiteBlockRenderer v-if="isPortal" :blocks="page?.blocks || []" :styles="page?.styles || null" :home-data="data" mode="production" />
  <div v-else class="sa-landing" data-testid="landing">
    <div class="lp-progress" :style="{ width: progress + '%' }" aria-hidden="true" />
    <LpHeader />
    <main>
      <LpHero />
      <LpModules />
      <LpBuilder />
      <LpCrm />
      <LpProperties />
      <LpTeam />
      <LpFeatures />
      <LpHowItWorks />
      <LpFaq />
      <LpDemo />
    </main>
    <LpFooter />
  </div>
</template>

<script setup lang="ts">
import { realEstateAgentJsonLd } from '~/utils/corporateSchema'
import SiteBlockRenderer from '~/components/site-builder/SiteBlockRenderer.vue'
import LpHeader from '~/components/landing/LpHeader.vue'
import LpHero from '~/components/landing/LpHero.vue'
import LpModules from '~/components/landing/LpModules.vue'
import LpBuilder from '~/components/landing/LpBuilder.vue'
import LpCrm from '~/components/landing/LpCrm.vue'
import LpProperties from '~/components/landing/LpProperties.vue'
import LpTeam from '~/components/landing/LpTeam.vue'
import LpFeatures from '~/components/landing/LpFeatures.vue'
import LpHowItWorks from '~/components/landing/LpHowItWorks.vue'
import LpFaq from '~/components/landing/LpFaq.vue'
import LpDemo from '~/components/landing/LpDemo.vue'
import LpFooter from '~/components/landing/LpFooter.vue'
import { LANDING_FAQ, LANDING_HERO, LANDING_SHOTS } from '~/utils/landing'

// "/" is host-aware (see server/api/public/tenant.get.ts): the primary/default
// host keeps this SaaS marketing landing page, while a resolved tenant custom
// domain gets that org's own real-estate portal home instead. definePageMeta
// can't branch at runtime, so both branches live in this one page under the
// 'root' layout (layouts/root.vue), which does the equivalent branching for
// the surrounding chrome (site header/footer vs. none).
definePageMeta({ layout: 'root', transparentHero: true })

const { tenant, load: loadTenant } = useTenant()
await loadTenant()
const isPortal = computed(() => tenant.value?.isCustomDomain === true)

// Barra de progreso de lectura y animaciones de aparición (.lp-reveal). Nunca
// se carga nada externo; respeta «reducir movimiento».
const progress = ref(0)
onMounted(() => {
  if (isPortal.value) return
  const root = document.querySelector('.sa-landing')
  if (!root) return

  // Analítica de la landing: sólo si ya hay un GA4 cargado con consentimiento
  // (plugins/consent-scripts.client.ts). Cada botón con `data-landing-event`
  // envía su nombre al hacer clic.
  root.addEventListener('click', (ev) => {
    const el = (ev.target as HTMLElement | null)?.closest<HTMLElement>('[data-landing-event]')
    const name = el?.dataset.landingEvent
    const gtag = (window as any).gtag
    if (name && typeof gtag === 'function') gtag('event', name, { event_category: 'landing' })
  })

  // Sólo con JS ocultamos para animar: sin él, el contenido se ve igual.
  root.classList.add('lp-js')
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const reveals = Array.from(root.querySelectorAll<HTMLElement>('.lp-reveal'))
  if (reduced) {
    reveals.forEach((el) => el.classList.add('is-visible'))
  } else if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible')
          io.unobserve(e.target)
        }
      }),
      { threshold: 0.08 },
    )
    reveals.forEach((el) => io.observe(el))
  } else {
    reveals.forEach((el) => el.classList.add('is-visible'))
  }

  const onScroll = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    progress.value = max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()
})

let data = ref<any>(null)
let page = ref<any>(null)
if (isPortal.value) {
  ;({ data } = await useFetch('/api/public/home'))
  ;({ data: page } = await useFetch('/api/public/site-pages/home'))
}

if (isPortal.value) {
  // La inmobiliaria como RealEstateAgent con sus oficinas publicadas
  // (utils/corporateSchema.ts): sólo con lo que existe en la cuenta.
  const portalUrl = useRequestURL()
  const portalOrigin = `${portalUrl.protocol}//${portalUrl.host}`
  const company = data.value?.company
  const jsonLd = company?.companyName
    ? realEstateAgentJsonLd(
        portalOrigin,
        { companyName: company.companyName, logoUrl: company.logo ? `${portalOrigin}${mediaUrl(company.logo)}` : null, phone: company.phone, email: company.email, social: company.social },
        (data.value?.offices || []).map((o: any) => ({ ...o, photoUrl: o.photo ? `${portalOrigin}${mediaUrl(o.photo)}` : null })),
      )
    : null
  useHead({
    ...seoHead({
      title: page.value?.seo?.title || `${tenant.value?.companyName || tenant.value?.name} — Propiedades excepcionales`,
      description:
        page.value?.seo?.description ||
        'Marketplace curado de proyectos off-plan, ventas de segunda mano y comunidades residenciales.',
    }),
    ...(jsonLd ? { script: [{ type: 'application/ld+json', innerHTML: JSON.stringify(jsonLd) }] } : {}),
  })
} else {
  // La landing comercial de INMO (utils/landing.ts): SEO completo con la
  // captura real del panel como imagen social, canónica en el host principal
  // y datos estructurados del producto y de las preguntas frecuentes.
  const url = useRequestURL()
  const origin = `${url.protocol}//${url.host}`
  const title = 'INMO — Tu inmobiliaria, a otro nivel'
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
 * Sistema visual de la landing comercial de INMO (sin ámbito: lo comparten las
 * secciones de components/landing/*). Rediseño «Experiencia premium»: azul de
 * marca sobre blanco, tipografía Inter (la global, sin cargar más fuentes),
 * composición y animaciones del sitio de referencia. Responsive de móvil a
 * escritorio y respeto de «reducir movimiento».
 */
.sa-landing {
  --lp-blue: #087cfa;
  --lp-blue-ink: #0a6fe0;
  --lp-sky: #e9f3ff;
  --lp-ink: #111315;
  --lp-ink-soft: #2b2f34;
  --lp-text: #4a4f57;
  --lp-muted: #70747b;
  --lp-line: #e3e7ec;
  --lp-paper: #ffffff;
  --lp-paper-2: #f5f7fa;
  --lp-dark: #101319;
  --lp-dark-2: #202630;
  --lp-radius: 14px;
  --lp-shadow: 0 30px 80px -40px rgba(32, 59, 92, 0.4);
  --lp-ease: cubic-bezier(0.22, 1, 0.36, 1);
  background: var(--lp-paper);
  color: var(--lp-ink);
  font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
  overflow-x: clip;
}
.sa-landing :where(h1, h2, h3, h4) {
  color: var(--lp-ink);
  margin: 0;
}
.sa-landing :where(a) {
  color: inherit;
  text-decoration: none;
}
.sa-landing :where(a, button, summary):focus-visible {
  outline: 3px solid var(--lp-blue);
  outline-offset: 4px;
  border-radius: 6px;
}
.sa-landing :where(section[id]) {
  scroll-margin-top: 96px;
}
.sa-landing img {
  display: block;
  max-width: 100%;
}
.sa-landing p {
  color: var(--lp-muted);
  line-height: 1.7;
}
.lp-shell {
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 clamp(20px, 4vw, 56px);
}
.lp-section {
  padding: clamp(64px, 8vw, 110px) 0;
}
/* Barra de progreso de lectura */
.lp-progress {
  position: fixed;
  top: 0;
  left: 0;
  height: 3px;
  width: 0;
  background: var(--lp-blue);
  z-index: 60;
  transition: width 0.1s linear;
}
/* Tipografía de titulares */
.lp-h1 {
  font-size: clamp(44px, 5.4vw, 78px);
  line-height: 1.05;
  letter-spacing: -0.035em;
  font-weight: 600;
}
.lp-h1 em {
  font-style: normal;
  color: var(--lp-blue);
}
.lp-h2 {
  font-size: clamp(31px, 3.7vw, 50px);
  line-height: 1.12;
  letter-spacing: -0.025em;
  font-weight: 600;
}
.lp-h2 span {
  color: var(--lp-blue);
}
.lp-lede {
  font-size: clamp(15px, 1.2vw, 17px);
  line-height: 1.75;
  color: var(--lp-muted);
  margin: 0;
}
/* Botones */
.lp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 17px 24px;
  border-radius: 9px;
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  border: 1px solid transparent;
  cursor: pointer;
  text-decoration: none;
  transition: transform 0.3s var(--lp-ease), background-color 0.3s, color 0.25s, border-color 0.25s, box-shadow 0.25s;
}
.lp-btn:hover {
  transform: translateY(-3px);
}
.lp-btn:active {
  transform: translateY(-1px);
}
.lp-btn-primary {
  background: var(--lp-ink);
  color: #fff;
}
.lp-btn-primary:hover {
  background: var(--lp-blue);
}
.lp-btn-blue {
  background: var(--lp-blue);
  color: #fff;
  box-shadow: 0 16px 34px -18px rgba(8, 124, 250, 0.7);
}
.lp-btn-blue:hover {
  background: var(--lp-blue-ink);
}
.lp-btn-ghost {
  background: var(--lp-paper);
  color: var(--lp-ink);
  border-color: var(--lp-line);
}
.lp-btn-ghost:hover {
  border-color: var(--lp-ink);
}
.lp-btn-white {
  background: #fff;
  color: #151515;
}
.lp-btn-white:hover {
  background: var(--lp-blue);
  color: #fff;
}
.lp-btn-sm {
  padding: 12px 17px;
  gap: 10px;
  font-size: 13px;
}
.lp-btn-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
/* Enlace de texto con flecha */
.lp-text-link {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--lp-ink);
  transition: color 0.2s;
}
.lp-text-link svg {
  width: 16px;
  height: 16px;
  transition: transform 0.2s var(--lp-ease);
}
.lp-text-link:hover {
  color: var(--lp-blue);
}
.lp-text-link:hover svg {
  transform: translateX(3px);
}
/* Marca INMO (cabecera y pie) */
.lp-brand {
  display: inline-flex;
  align-items: baseline;
  font-size: 32px;
  font-weight: 800;
  letter-spacing: -0.06em;
  color: var(--lp-ink);
  text-decoration: none;
}
.lp-brand sup {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  margin-left: 3px;
  top: -0.9em;
}
.lp-dark .lp-brand {
  color: #fff;
}
/* Encabezado de sección a dos columnas (copy + párrafo/enlace) */
.lp-section-top {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: clamp(32px, 6vw, 90px);
  align-items: end;
  margin-bottom: clamp(36px, 5vw, 52px);
}
.lp-section-top .lp-h2 {
  max-width: 16ch;
}
.lp-section-top p {
  margin: 0 0 20px;
  max-width: 46ch;
  font-size: 15px;
}
/* Punto verde «en vivo» */
.lp-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #48b985;
  box-shadow: 0 0 0 4px rgba(72, 185, 133, 0.12);
  flex-shrink: 0;
}
/* Animaciones de aparición (sólo si hay JS: sin él, visible) */
.sa-landing.lp-js .lp-reveal {
  opacity: 0;
  transform: translateY(26px);
  transition: opacity 0.8s var(--lp-ease), transform 0.8s var(--lp-ease);
}
.sa-landing.lp-js .lp-reveal.is-visible {
  opacity: 1;
  transform: none;
}
@keyframes lp-float {
  50% {
    transform: translateY(-9px);
  }
}
@media (max-width: 860px) {
  .lp-section-top {
    grid-template-columns: 1fr;
    gap: 22px;
    align-items: start;
  }
  .lp-section-top .lp-h2 {
    max-width: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .sa-landing *,
  .sa-landing *::before,
  .sa-landing *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
  }
  .sa-landing.lp-js .lp-reveal {
    opacity: 1;
    transform: none;
  }
}
</style>
