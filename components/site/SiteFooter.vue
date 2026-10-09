<template>
  <footer class="sf no-print" :class="[`sf-size-${cfg.design.fontSize}`, `sf-space-${cfg.design.spacing}`, `sf-gap-${cfg.design.columnGap}`]" :style="cssVars" :data-config-source="configSource" data-testid="site-footer">
    <!-- A · Zona principal: columnas y, abajo, el paisaje -->
    <div class="sf-main">
      <div class="sf-grid mx-auto max-w-screen-2xl px-6 lg:px-10" :style="{ '--sf-cols': gridColumns }" :data-columns="sections.length" data-testid="footer-columns">
        <template v-for="key in sections" :key="key">
          <!-- Identidad -->
          <div v-if="key === 'identity'" class="sf-col sf-col-identity" :class="mobileHidden('identity')" data-footer-section="identity" data-testid="footer-col-identity">
            <NuxtLink to="/" class="inline-block" :aria-label="companyName || undefined">
              <Logo size="md" :company-name="companyName" :logo-url="mediaUrl(tenant?.logo)" />
            </NuxtLink>
            <p class="sf-description" data-testid="footer-description">{{ cfg.description || t('footer.tagline') }}</p>
            <ul v-if="cfg.show.social && social.length" class="sf-social" :class="[`sf-social-${cfg.design.socialStyle}`, mobileHidden('social')]" data-testid="footer-social">
              <li v-for="s in social" :key="s.network">
                <a :href="s.url" target="_blank" rel="noopener noreferrer" class="sf-social-link" :aria-label="networkLabel(s.network)" :data-network="s.network">
                  <svg class="h-[17px] w-[17px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <template v-if="s.network === 'instagram'"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".6" fill="currentColor" /></template>
                    <path v-else-if="s.network === 'facebook'" d="M14.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.6 1.6-1.6h1.5V4.3c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.4H8.9v3h2.6V21" />
                    <template v-else-if="s.network === 'linkedin'"><path d="M4.5 9.5v10M4.5 5.2v.1" /><path d="M9 19.5v-10M9 13.6c0-2.3 1.5-4.1 3.7-4.1 2.3 0 3.3 1.5 3.3 4v6" /></template>
                    <template v-else-if="s.network === 'youtube'"><rect x="2.5" y="5.5" width="19" height="13" rx="3.5" /><path d="m10.2 9.4 4.6 2.6-4.6 2.6z" fill="currentColor" /></template>
                    <path v-else-if="s.network === 'x'" d="M4 4l6.8 9.1L4.3 20h1.6l5.6-6 4.5 6H20l-7.1-9.6L19 4h-1.6l-5.2 5.6L8 4z" />
                    <path v-else-if="s.network === 'tiktok'" d="M14.5 3c.4 2.6 2 4.3 4.5 4.6v3c-1.7 0-3.2-.5-4.5-1.4v6.1a5.6 5.6 0 1 1-5.6-5.6c.3 0 .6 0 .9.1v3.1a2.6 2.6 0 1 0 1.7 2.4V3z" />
                    <template v-else><circle cx="12" cy="12" r="9" /><path d="M10.6 20.3 12.4 13M11.3 15.6c.5.4 1.2.7 2 .7 2.4 0 4-1.9 4-4.5 0-2.6-2.2-4.6-5.1-4.6-3.1 0-5.1 2.2-5.1 4.6 0 1.2.5 2.4 1.4 2.8" /></template>
                  </svg>
                </a>
              </li>
            </ul>
          </div>

          <!-- Explorar / Empresa / Servicios -->
          <nav
            v-else-if="key === 'explore' || key === 'company' || key === 'services'"
            class="sf-col sf-col-links"
            :class="[mobileHidden(key), { 'is-open': openColumns.has(key) }]"
            :aria-label="columnTitle(key)"
            :data-footer-section="key"
            :data-testid="`footer-col-${key}`"
          >
            <button v-if="cfg.mobileAccordions" type="button" class="sf-heading-btn" :aria-expanded="openColumns.has(key)" :data-testid="`footer-toggle-${key}`" @click="toggleColumn(key)">
              <span class="sf-heading" :class="`sf-heading-${cfg.design.headingStyle}`">{{ columnTitle(key) }}</span>
              <svg class="sf-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6" /></svg>
            </button>
            <p v-else class="sf-heading-wrap"><span class="sf-heading" :class="`sf-heading-${cfg.design.headingStyle}`">{{ columnTitle(key) }}</span></p>
            <ul class="sf-links" :class="{ 'sf-links-accordion': cfg.mobileAccordions }">
              <li v-for="link in columnLinks(key)" :key="link.id">
                <a v-if="link.external" :href="link.to" target="_blank" rel="noopener noreferrer" class="sf-link" :data-link-id="link.id">{{ link.label }}</a>
                <NuxtLink v-else :to="link.to" class="sf-link" :data-link-id="link.id">{{ link.label }}</NuxtLink>
              </li>
            </ul>
          </nav>

          <!-- Suscríbete y contacto -->
          <div v-else-if="key === 'newsletter'" class="sf-col sf-col-newsletter" :class="mobileHidden('newsletter')" data-footer-section="newsletter" data-testid="footer-col-newsletter">
            <template v-if="cfg.show.newsletter">
              <p class="sf-heading-wrap"><span class="sf-heading" :class="`sf-heading-${cfg.design.headingStyle}`">{{ cfg.newsletter.title || t('footer.subscribe', 'Suscríbete') }}</span></p>
              <p class="sf-newsletter-text" data-testid="footer-newsletter-text">{{ cfg.newsletter.text || newsletterDefaultText }}</p>
              <FooterNewsletter :company-name="companyName" :sandbox="!!tenantOverride" />
            </template>
            <div v-if="hasContact" class="sf-contact" :class="[mobileHidden('contact'), { 'sf-contact-alone': !cfg.show.newsletter }]" data-testid="footer-contact">
              <div v-if="contact.phone" class="sf-contact-item">
                <span class="sf-contact-icon" aria-hidden="true">
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h3.5l1.6 4.2-2.2 1.4a11 11 0 0 0 6.5 6.5l1.4-2.2L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z" /></svg>
                </span>
                <span class="min-w-0">
                  <a :href="contact.phone.href" class="sf-contact-main" data-testid="footer-contact-phone">{{ contact.phone.label }}</a>
                  <span v-if="contact.hours" class="sf-contact-sub" data-testid="footer-contact-hours">{{ contact.hours }}</span>
                </span>
              </div>
              <div v-if="contact.location" class="sf-contact-item">
                <span class="sf-contact-icon" aria-hidden="true">
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></svg>
                </span>
                <span class="min-w-0">
                  <span class="sf-contact-main" data-testid="footer-contact-location">{{ contact.location.label }}</span>
                  <a v-if="contact.location.mapUrl" :href="contact.location.mapUrl" target="_blank" rel="noopener noreferrer" class="sf-contact-sub sf-map-link" data-testid="footer-map-link">{{ t('footer.viewOnMap', 'Ver en el mapa') }}</a>
                </span>
              </div>
            </div>
          </div>
        </template>
      </div>

      <FooterLandscape v-if="cfg.landscape.mode === 'preset' || (cfg.landscape.mode === 'image' && cfg.landscape.image)" :landscape="cfg.landscape" :hide-on-mobile="cfg.hideOnMobile.includes('landscape')" />
    </div>

    <!-- B · Barra inferior oscura -->
    <div class="sf-bottom" data-testid="footer-bottom">
      <div class="sf-bottom-inner mx-auto max-w-screen-2xl px-6 lg:px-10">
        <p class="sf-copy" data-testid="footer-copyright">© {{ year }} {{ cfg.bottom.copyright || companyName }}. {{ t('footer.rights') }}</p>
        <nav class="sf-legal" :aria-label="t('footer.legal', 'Legal')" data-testid="footer-legal">
          <NuxtLink v-if="cfg.bottom.showPrivacy" to="/privacidad" class="sf-legal-link" data-testid="footer-legal-privacy">{{ t('footer.privacy') }}</NuxtLink>
          <NuxtLink v-if="cfg.bottom.showTerms" to="/terminos" class="sf-legal-link" data-testid="footer-legal-terms">{{ t('footer.terms') }}</NuxtLink>
          <NuxtLink v-if="cfg.bottom.showCookies" to="/cookies" class="sf-legal-link" data-testid="footer-legal-cookies">{{ t('cookie.policy') }}</NuxtLink>
          <!-- Cambiar o retirar el consentimiento en cualquier momento: abre el panel real del aviso de cookies. -->
          <button v-if="cfg.bottom.showCookieSettings" type="button" class="sf-legal-link" data-testid="footer-cookie-settings" @click="cookieConsent.openSettings()">{{ t('cookie.footerLink') }}</button>
        </nav>
        <div class="sf-tools">
          <div v-if="cfg.bottom.showLanguage" ref="langRoot" class="relative" data-testid="footer-language">
            <button type="button" class="sf-lang-btn" :aria-expanded="langOpen" :aria-label="t('selector.language', 'Idioma')" @click="langOpen = !langOpen">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 3.8 6 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-6-3.8-9S9.5 5.7 12 3z" /></svg>
              <span class="uppercase">{{ locale }}</span>
              <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            <div v-if="langOpen" class="sf-lang-menu" role="menu">
              <button v-for="l in locales" :key="l.code" type="button" role="menuitem" class="sf-lang-item" :class="{ 'font-semibold': l.code === locale }" :data-locale="l.code" @click="pickLocale(l.code)">
                <span>{{ l.flag }}</span><span class="flex-1 text-left">{{ l.label }}</span>
              </button>
            </div>
          </div>
          <button v-if="cfg.bottom.showBackToTop" ref="topBtn" type="button" class="sf-top" :aria-label="t('footer.backToTop', 'Volver arriba')" data-testid="footer-back-to-top" @click="toTop">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
          </button>
        </div>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import type { TenantBranding } from '~/composables/useTenant'
import FooterNewsletter from './FooterNewsletter.vue'
import FooterLandscape from './FooterLandscape.vue'
import {
  FOOTER_LINK_COLUMNS,
  FOOTER_SOCIAL_NETWORKS,
  defaultFooterConfig,
  footerPalette,
  normalizeFooterConfig,
  resolveFooterContact,
  resolveFooterLinks,
  resolveFooterSocial,
  type FooterAvailability,
  type FooterConfig,
  type FooterLinkColumnKey,
  type FooterMobileHideable,
  type FooterProfile,
  type FooterSectionKey,
} from '~/utils/siteFooter'

/**
 * El pie global de la web (utils/siteFooter.ts): cinco columnas en
 * escritorio —identidad, Explorar, Empresa, Servicios y Suscríbete con el
 * contacto—, un paisaje opcional muy suave y la barra inferior oscura con el
 * copyright, los legales, «Configurar cookies», el idioma y «volver arriba».
 *
 * En la web lee lo publicado (GET /api/public/site-footer); en el lienzo del
 * Constructor recibe el borrador (`config`) y los datos de la empresa
 * (`meta`) del editor, con la marca de la organización que se edita
 * (`tenantOverride`). Lo que no existe no se enseña: enlaces sin destino,
 * redes sin URL válida, contacto sin datos.
 */
const props = withDefaults(
  defineProps<{
    tenantOverride?: TenantBranding | null
    config?: FooterConfig | null
    meta?: { profile: FooterProfile | null; available: FooterAvailability | null } | null
  }>(),
  { tenantOverride: null, config: null, meta: null },
)

const { t, locale, locales, setLocale } = useI18n()
const { tenant: hostTenant, load: loadTenant } = useTenant()
await loadTenant()
const tenant = computed(() => props.tenantOverride ?? hostTenant.value)
// En el lienzo del Constructor abre el aviso de muestra, que no guarda nada. Se
// decide al pulsar: en el lienzo, `tenantOverride` llega después del setup.
const siteConsent = useCookieConsent('site')
const sandboxConsent = useCookieConsent('sandbox')
const cookieConsent = computed(() => (props.tenantOverride ? sandboxConsent : siteConsent))

interface PublicFooter {
  config: FooterConfig
  profile: FooterProfile
  available: FooterAvailability
}
const fetcher = useRequestFetch()
const { data: published } = await useAsyncData<PublicFooter | null>('site-footer', () =>
  props.tenantOverride ? Promise.resolve(null) : fetcher<PublicFooter>('/api/public/site-footer').catch(() => null),
)

const cfg = computed<FooterConfig>(() => {
  if (props.tenantOverride) return normalizeFooterConfig(props.config)
  return published.value?.config ? normalizeFooterConfig(published.value.config) : defaultFooterConfig()
})
// De dónde sale lo que se pinta (lo comprueban las pruebas): el borrador del editor, lo publicado o el pie de partida.
const configSource = computed(() => (props.tenantOverride ? (props.config ? 'draft' : 'none') : published.value?.config ? 'published' : 'default'))
const profile = computed(() => (props.tenantOverride ? props.meta?.profile : published.value?.profile) ?? null)
const available = computed(() => (props.tenantOverride ? props.meta?.available : published.value?.available) ?? null)

const companyName = computed(() => tenant.value?.companyName || tenant.value?.name || '')
const year = new Date().getFullYear()

function columnTitle(key: FooterLinkColumnKey) {
  const def = FOOTER_LINK_COLUMNS.find((c) => c.key === key)!
  return cfg.value.columns[key].title || t(def.i18nKey, def.label)
}
function columnLinks(key: FooterLinkColumnKey) {
  return resolveFooterLinks(cfg.value.columns[key], available.value, t)
}
const social = computed(() => resolveFooterSocial(cfg.value, profile.value))
const networkLabel = (key: string) => FOOTER_SOCIAL_NETWORKS.find((n) => n.key === key)?.label || key
const contact = computed(() => resolveFooterContact(cfg.value, profile.value))
const hasContact = computed(() => cfg.value.show.contact && !!(contact.value.phone || contact.value.location))
const newsletterDefaultText = computed(() =>
  companyName.value
    ? t('footer.newsletter.text', 'Recibe las últimas novedades, propiedades y oportunidades de {name}.').replace('{name}', companyName.value)
    : t('footer.newsletter.textGeneric', 'Recibe las últimas novedades, propiedades y oportunidades.'),
)
const mobileHidden = (key: FooterMobileHideable) => (cfg.value.hideOnMobile.includes(key) ? 'max-sm:hidden' : '')

// Columnas que se pintan, en su orden. Una columna de enlaces sin ningún
// enlace con destino no deja un hueco con sólo su título.
const sections = computed<FooterSectionKey[]>(() =>
  cfg.value.order.filter((key) => {
    if (key === 'newsletter') return cfg.value.show.newsletter || hasContact.value
    if (!cfg.value.show[key]) return false
    if (key === 'explore' || key === 'company' || key === 'services') return columnLinks(key).length > 0
    return true
  }),
)
const COLUMN_WIDTH: Record<FooterSectionKey, string> = { identity: 'minmax(0,1.55fr)', explore: 'minmax(0,1fr)', company: 'minmax(0,1fr)', services: 'minmax(0,1fr)', newsletter: 'minmax(0,1.5fr)' }
const gridColumns = computed(() => sections.value.map((k) => COLUMN_WIDTH[k]).join(' '))

// Acordeones del móvil (en tableta y escritorio las columnas están siempre abiertas).
const openColumns = ref(new Set<FooterLinkColumnKey>())
function toggleColumn(key: FooterLinkColumnKey) {
  const next = new Set(openColumns.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  openColumns.value = next
}

const palette = computed(() => footerPalette(cfg.value.design, tenant.value?.brandColor))
const cssVars = computed(() => ({
  '--sf-bg': palette.value.background,
  '--sf-text': palette.value.text,
  '--sf-head-bg': palette.value.headingBackground,
  '--sf-head-text': palette.value.headingText,
  '--sf-accent': palette.value.accent,
  '--sf-bottom-bg': palette.value.bottomBackground,
  '--sf-bottom-text': palette.value.bottomText,
}))

// Idioma
const langOpen = ref(false)
const langRoot = ref<HTMLElement | null>(null)
function pickLocale(code: string) {
  setLocale(code)
  langOpen.value = false
}
function onDocClick(e: MouseEvent) {
  if (langOpen.value && langRoot.value && !langRoot.value.contains(e.target as Node)) langOpen.value = false
}

// Volver arriba: suave (salvo con «reducir movimiento»). Mientras se ve el
// del pie, el botón flotante (components/ScrollTop.vue) se esconde: nunca dos.
const topBtn = ref<HTMLElement | null>(null)
const footerTopVisible = useState<boolean>('site-footer-top-visible', () => false)
function toTop() {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
}
let observer: IntersectionObserver | null = null
onMounted(() => {
  document.addEventListener('click', onDocClick)
  if (props.tenantOverride || typeof IntersectionObserver === 'undefined') return
  observer = new IntersectionObserver(([entry]) => {
    footerTopVisible.value = !!entry?.isIntersecting
  })
  watch(
    topBtn,
    (el, prev) => {
      if (prev) observer?.unobserve(prev)
      if (el) observer?.observe(el)
      else footerTopVisible.value = false
    },
    { immediate: true },
  )
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  observer?.disconnect()
  if (!props.tenantOverride) footerTopVisible.value = false
})
</script>

<style scoped>
.sf {
  background: var(--sf-bg);
  color: var(--sf-text);
  border-top: 1px solid color-mix(in srgb, var(--sf-text) 10%, transparent);
}
.sf-main {
  position: relative;
}

/* Espaciado, separación de columnas y tamaño de letra (Diseño) */
.sf-space-compact .sf-grid {
  padding-top: 2.5rem;
  padding-bottom: 2rem;
}
.sf-space-normal .sf-grid {
  padding-top: 4rem;
  padding-bottom: 3rem;
}
.sf-space-airy .sf-grid {
  padding-top: 5.5rem;
  padding-bottom: 4.5rem;
}
.sf-gap-sm .sf-grid {
  --sf-gap: 1.5rem;
}
.sf-gap-md .sf-grid {
  --sf-gap: 2.5rem;
}
.sf-gap-lg .sf-grid {
  --sf-gap: 3.5rem;
}
.sf-size-sm {
  --sf-link-size: 0.8125rem;
}
.sf-size-md {
  --sf-link-size: 0.875rem;
}
.sf-size-lg {
  --sf-link-size: 0.9375rem;
}

/* Móvil: una columna; tableta: identidad y newsletter arriba, enlaces debajo; escritorio: todas en fila */
.sf-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 2rem;
}
@media (min-width: 640px) {
  .sf-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
    column-gap: var(--sf-gap);
    row-gap: 2.75rem;
  }
  .sf-col-identity,
  .sf-col-newsletter {
    grid-column: span 3;
  }
  .sf-col-identity {
    order: -2;
  }
  .sf-col-newsletter {
    order: -1;
  }
  .sf-col-links {
    grid-column: span 2;
  }
}
@media (min-width: 1024px) {
  .sf-grid {
    grid-template-columns: var(--sf-cols);
  }
  .sf-col-identity,
  .sf-col-newsletter,
  .sf-col-links {
    grid-column: auto;
    order: 0;
  }
}

.sf-description {
  margin-top: 1.25rem;
  max-width: 22rem;
  font-size: var(--sf-link-size);
  line-height: 1.65;
}

/* Etiqueta de cabecera de columna: píldora suave o texto */
.sf-heading-wrap {
  margin-bottom: 1.15rem;
}
.sf-heading {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--sf-head-text);
}
.sf-heading-pill {
  border-radius: 9999px;
  background: var(--sf-head-bg);
  padding: 0.35rem 0.85rem;
}
.sf-heading-btn {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.15rem;
  text-align: left;
}
.sf-chev {
  height: 1rem;
  width: 1rem;
  transition: transform 0.2s;
}
.is-open .sf-chev {
  transform: rotate(180deg);
}
@media (max-width: 639.98px) {
  .sf-col-links {
    border-bottom: 1px solid color-mix(in srgb, var(--sf-text) 12%, transparent);
    padding-bottom: 0.25rem;
  }
  .sf-links-accordion {
    display: none;
    padding-bottom: 1rem;
  }
  .is-open .sf-links-accordion {
    display: block;
  }
}
@media (min-width: 640px) {
  .sf-heading-btn {
    pointer-events: none;
  }
  .sf-chev {
    display: none;
  }
}

.sf-links > li + li {
  margin-top: 0.8rem;
}
.sf-link {
  font-size: var(--sf-link-size);
  transition: color 0.2s;
}
.sf-link:hover {
  color: var(--sf-head-text);
  text-decoration: underline;
  text-underline-offset: 3px;
}

/* Redes: círculos discretos; al pasar, el color de la empresa */
.sf-social {
  margin-top: 1.5rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}
.sf-social-link {
  display: flex;
  height: 2.375rem;
  width: 2.375rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  transition: background-color 0.2s, color 0.2s, border-color 0.2s, transform 0.2s;
}
.sf-social-soft .sf-social-link {
  background: color-mix(in srgb, var(--sf-text) 9%, transparent);
}
.sf-social-outline .sf-social-link {
  border: 1px solid color-mix(in srgb, var(--sf-text) 28%, transparent);
}
.sf-social-solid .sf-social-link {
  background: var(--sf-accent);
  color: #fff;
}
.sf-social-link:hover {
  background: var(--sf-accent);
  border-color: var(--sf-accent);
  color: #fff;
  transform: translateY(-1px);
}

.sf-newsletter-text {
  margin-bottom: 1rem;
  font-size: var(--sf-link-size);
  line-height: 1.55;
}

/* Contacto, bajo una línea fina */
.sf-contact {
  margin-top: 1.5rem;
  display: grid;
  gap: 1rem;
  border-top: 1px solid color-mix(in srgb, var(--sf-text) 14%, transparent);
  padding-top: 1.5rem;
}
.sf-contact-alone {
  margin-top: 0;
  border-top: 0;
  padding-top: 0;
}
@media (min-width: 640px) and (max-width: 1023.98px), (min-width: 1280px) {
  .sf-contact {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.sf-contact-item {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 0.7rem;
}
.sf-contact-icon {
  display: flex;
  height: 2.25rem;
  width: 2.25rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--sf-text) 9%, transparent);
}
.sf-contact-main {
  display: block;
  font-size: var(--sf-link-size);
  font-weight: 600;
  overflow-wrap: anywhere;
}
.sf-contact-sub {
  display: block;
  margin-top: 0.15rem;
  font-size: 0.78rem;
  opacity: 0.85;
}
.sf-map-link {
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* Barra inferior oscura, a todo el ancho */
.sf-bottom {
  background: var(--sf-bottom-bg);
  color: var(--sf-bottom-text);
}
.sf-bottom-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.9rem;
  padding-top: 1.4rem;
  padding-bottom: 1.4rem;
  text-align: center;
  font-size: 0.78rem;
}
@media (min-width: 1024px) {
  .sf-bottom-inner {
    min-height: 5.5rem;
    flex-direction: row;
    justify-content: space-between;
    text-align: left;
  }
}
.sf-legal {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  row-gap: 0.4rem;
}
.sf-legal-link {
  padding: 0 0.7rem;
  opacity: 0.85;
  transition: opacity 0.2s;
}
.sf-legal-link + .sf-legal-link {
  border-left: 1px solid color-mix(in srgb, var(--sf-bottom-text) 30%, transparent);
}
.sf-legal-link:hover {
  opacity: 1;
  text-decoration: underline;
  text-underline-offset: 3px;
}
@media (min-width: 1024px) {
  .sf-copy {
    border-right: 1px solid color-mix(in srgb, var(--sf-bottom-text) 30%, transparent);
    padding-right: 1.1rem;
  }
  .sf-legal {
    flex: 1;
    justify-content: flex-start;
    padding-left: 0.4rem;
  }
}
.sf-tools {
  display: flex;
  align-items: center;
  gap: 0.9rem;
}
.sf-lang-btn {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  border-radius: 9999px;
  padding: 0.4rem 0.6rem;
  font-weight: 600;
  transition: background-color 0.2s;
}
.sf-lang-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}
.sf-lang-menu {
  position: absolute;
  bottom: calc(100% + 0.5rem);
  right: 0;
  z-index: 50;
  width: 11rem;
  overflow: hidden;
  border-radius: 0.75rem;
  border: 1px solid #e7e2d9;
  background: #fff;
  padding: 0.25rem 0;
  color: #57524a;
  box-shadow: 0 18px 40px -18px rgba(0, 0, 0, 0.35);
}
.sf-lang-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.85rem;
}
.sf-lang-item:hover {
  background: #f6f3ee;
}
.sf-top {
  display: flex;
  height: 2.75rem;
  width: 2.75rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: #fff;
  color: var(--sf-bottom-bg);
  box-shadow: 0 8px 20px -10px rgba(0, 0, 0, 0.45);
  transition: transform 0.2s;
}
.sf-top:hover {
  transform: translateY(-2px);
}
.sf-top:active {
  transform: scale(0.94);
}
</style>
