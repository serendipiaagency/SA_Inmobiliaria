<template>
  <!-- Sin Teleport: ya es `fixed` sobre todo, y un Teleport a <body> desde el
       layout se hidrata después que los de app.vue (ToastHost, ConfirmHost) y
       recoge su bloque del HTML del servidor: desajuste de hidratación en cada
       página pública. -->
  <Transition :name="transitionName">
    <div
      v-if="state.open"
      class="cc-wrap no-print fixed inset-0 z-[70] flex"
      :data-position="cfg.layout.position"
      :data-mobile="cfg.layout.mobile"
      :style="wrapStyle"
      data-testid="cookie-consent"
      @click.self="close"
    >
      <div
        ref="dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="state.view === 'summary' ? descId : undefined"
        tabindex="-1"
        class="cookie-card cc-card relative flex w-full flex-col overflow-hidden outline-none"
        :class="[`cc-size-${cfg.design.fontSize}`, `cc-space-${cfg.design.spacing}`, cfg.layout.position === 'bottom' && state.view === 'summary' ? 'cc-banner' : '']"
        :style="cardStyle"
        :data-view="state.view"
        @keydown="onKeydown"
        @click="selectable && emit('select')"
      >
        <!-- Parte superior: logo de la empresa, título y cerrar (sólo cuando ya hay una decisión) -->
        <div class="cc-head flex items-start justify-between gap-4">
          <div class="min-w-0 flex-1" :class="cfg.design.titleAlign === 'center' ? 'text-center' : ''">
            <img v-if="logoUrl" :src="logoUrl" alt="" class="cc-logo mb-3 inline-block w-auto object-contain" :class="LOGO_HEIGHT[cfg.design.logoSize]" data-testid="cookie-logo" >
            <h2 :id="titleId" class="cc-title leading-tight" :class="titleClass">
              {{ state.view === 'settings' ? text('settingsTitle') : text('title') }}
            </h2>
          </div>
          <button
            v-if="decided || sandbox"
            type="button"
            class="cc-close -mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:bg-black/5"
            :aria-label="t('cookie.close')"
            data-testid="cookie-close"
            @click="close"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        <!-- Parte central -->
        <div class="cc-body thin-scroll min-h-0 flex-1 overflow-y-auto leading-relaxed">
          <template v-if="state.view === 'summary'">
            <p :id="descId">{{ text('intro') }}</p>
            <p class="mt-3">{{ text('optionalIntro') }}</p>
            <ul class="mt-2 space-y-1.5" data-testid="cookie-categories">
              <li v-for="c in categories" :key="c" class="flex gap-2">
                <CookieCategoryIcon v-if="cfg.design.categoryIcons" :category="c" class="cc-icon mt-[3px]" />
                <span v-else class="cc-dot mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full" aria-hidden="true" />
                <span>
                  <strong class="cc-strong font-semibold">{{ text(`${c}Title` as CookieTextKey) }}</strong><template v-if="cfg.behavior.showCategoryDescriptions">: {{ categoryText(c) }}</template>
                </span>
              </li>
            </ul>
            <p v-if="cfg.behavior.showChangeText" class="mt-3">{{ text('change') }}</p>
          </template>

          <div v-else class="space-y-3 pb-2" data-testid="cookie-settings">
            <p>{{ text('settingsIntro') }}</p>
            <div class="cc-cat rounded-xl border p-4">
              <div class="flex items-center justify-between gap-4">
                <p class="cc-strong flex items-center gap-2 font-semibold"><CookieCategoryIcon v-if="cfg.design.categoryIcons" category="necessary" class="cc-icon" />{{ text('necessaryTitle') }}</p>
                <span class="shrink-0 text-[12px] font-medium opacity-80">{{ t('cookie.alwaysOn') }}</span>
              </div>
              <p class="mt-1 text-[0.93em]">{{ text('necessaryDesc') }}</p>
            </div>
            <div v-for="c in categories" :key="c" class="cc-cat rounded-xl border p-4">
              <label class="flex cursor-pointer items-center justify-between gap-4">
                <span class="cc-strong flex items-center gap-2 font-semibold"><CookieCategoryIcon v-if="cfg.design.categoryIcons" :category="c" class="cc-icon" />{{ text(`${c}Title` as CookieTextKey) }}</span>
                <span class="relative inline-flex shrink-0 items-center">
                  <input v-model="draft[c]" type="checkbox" role="switch" class="peer sr-only" :data-testid="`cookie-toggle-${c}`" >
                  <span class="cc-switch h-6 w-11 rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2" />
                  <span class="pointer-events-none absolute left-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
                </span>
              </label>
              <p class="mt-1 text-[0.93em]">{{ categoryText(c) }}</p>
            </div>
          </div>

          <!-- Enlaces legales: siempre, en los dos estados (nunca se ocultan por configuración) -->
          <p class="mt-3 text-[0.93em]" data-testid="cookie-legal">
            <span v-if="controller && cfg.behavior.showController" data-testid="cookie-controller">{{ t('cookie.controller') }} {{ controller }}. </span>
            <NuxtLink to="/cookies" class="cc-link font-medium underline underline-offset-2" data-testid="cookie-policy-link" @click="leaveForPolicy">{{ text('policyLabel') }}</NuxtLink>
            ·
            <NuxtLink to="/privacidad" class="cc-link font-medium underline underline-offset-2" data-testid="cookie-privacy-link" @click="leaveForPolicy">{{ text('privacyLabel') }}</NuxtLink>
          </p>
        </div>

        <!-- Parte inferior: aceptar y rechazar con el mismo tamaño y la misma visibilidad -->
        <div class="cc-actions flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
          <template v-if="state.view === 'summary'">
            <button type="button" class="cookie-btn cookie-btn-quiet sm:mr-auto" data-testid="cookie-configure" @click="openSettingsView">{{ text('configure') }}</button>
            <button type="button" class="cookie-btn cookie-btn-outline" data-testid="cookie-reject" @click="rejectAll">{{ text('reject') }}</button>
            <button type="button" class="cookie-btn cookie-btn-solid" data-testid="cookie-accept" @click="acceptAll">{{ text('accept') }}</button>
          </template>
          <template v-else>
            <button type="button" class="cookie-btn cookie-btn-quiet sm:mr-auto" data-testid="cookie-back" @click="state.view = 'summary'">{{ text('back') }}</button>
            <button type="button" class="cookie-btn cookie-btn-outline" data-testid="cookie-reject-settings" @click="rejectAll">{{ text('reject') }}</button>
            <button type="button" class="cookie-btn cookie-btn-solid" data-testid="cookie-save" @click="saveDraft">{{ text('save') }}</button>
          </template>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { allChoices, type CookieChoices, type OptionalCookieCategory } from '~/utils/cookieConsent'
import { cookiePalette, cookieText, normalizeCookieNotice, SHADOWS, type CookieNoticeConfig, type CookieTextKey } from '~/utils/siteConsent'
import { TENANT_BRANDING_OVERRIDE } from '~/composables/useTenant'

/**
 * Aviso de consentimiento de cookies de la web pública: modal sobre la web
 * oscurecida, «Configurar | Rechazar | Aceptar y continuar», panel de
 * preferencias por categoría y «Guardar preferencias». El estado vive en
 * useCookieConsent; lo que se carga o se bloquea según la decisión, en
 * plugins/consent-scripts.client.ts y components/ConsentGate.vue.
 *
 * Su aspecto —textos, logo, colores, radio, posición, animación— es el que la
 * agencia publicó en el Constructor (utils/siteConsent.ts, GET
 * /api/public/site-consent); sin nada publicado, el de partida. Lo que NO es
 * configurable, a propósito: el orden y la visibilidad de los tres botones,
 * los interruptores apagados hasta decidir, los enlaces legales y que no se
 * pueda cerrar sin decidir.
 *
 * `sandbox`: la muestra del Constructor Web (lienzo) — funciona igual, pero
 * no guarda nada ni carga ningún proveedor; recibe el borrador por `config`.
 */
const props = withDefaults(defineProps<{ sandbox?: boolean; config?: CookieNoticeConfig | null; logo?: string | null; selectable?: boolean }>(), {
  sandbox: false,
  config: null,
  logo: null,
  selectable: false,
})
const emit = defineEmits<{ select: [] }>()

const { t, locale } = useI18n()
const { tenant: hostTenant } = useTenant()
const override = inject(TENANT_BRANDING_OVERRIDE, ref(null))
const sandbox = Boolean(props.sandbox)
const tenant = computed(() => (sandbox ? override.value : hostTenant.value))
const { state, categories, choices, decided, providers, acceptAll, rejectAll, save, close, init } = useCookieConsent(sandbox ? 'sandbox' : 'site')
const titleId = `cookie-title-${sandbox ? 'sb' : 'site'}`
const descId = `cookie-desc-${sandbox ? 'sb' : 'site'}`
const dialog = ref<HTMLElement | null>(null)

// La presentación publicada (web) o el borrador del editor (lienzo).
const published = sandbox ? null : await useSiteConsent()
const cfg = computed<CookieNoticeConfig>(() => (sandbox ? normalizeCookieNotice(props.config) : published!.config.value.cookie))
const logoUrl = computed(() => {
  if (!cfg.value.design.showLogo) return null
  const key = cfg.value.design.logo || (sandbox ? props.logo : published!.logo.value) || null
  return key ? mediaUrl(key) : null
})
const text = (key: CookieTextKey) => cookieText(cfg.value, locale.value, key, (k) => t(k))

// Lo que se marca en «Configurar» antes de guardar: parte de la decisión vigente.
const draft = reactive<CookieChoices>(allChoices(false))
function syncDraft() {
  Object.assign(draft, choices.value)
}
function openSettingsView() {
  syncDraft()
  state.value.view = 'settings'
}
function saveDraft() {
  save({ ...draft })
}

/** Responsable del tratamiento: los datos legales de ESTA agencia, nunca unos comunes. */
const controller = computed(() => tenant.value?.legalCompanyName || tenant.value?.companyName || tenant.value?.name || '')

function categoryText(c: OptionalCookieCategory): string {
  const base = text(`${c}Desc` as CookieTextKey)
  if (c === 'analytics' && providers.value.ga4) return `${base} ${t('cookie.cat.analytics.ga')}`
  return base
}

// Leer la política no es decidir: el aviso se aparta para dejarla leer y
// vuelve a salir en la página siguiente si sigue sin decisión.
function leaveForPolicy() {
  if (!decided.value && !sandbox) state.value.open = false
}

// ---------------------------------------------------------------------------
// Aspecto
// ---------------------------------------------------------------------------
const LOGO_HEIGHT = { sm: 'h-7', md: 'h-9', lg: 'h-12' } as const
const TITLE_SIZE = { sm: 'text-[18px] sm:text-[20px]', md: 'text-[22px] sm:text-[26px]', lg: 'text-[26px] sm:text-[32px]' } as const
const TITLE_WEIGHT = { normal: 'font-normal', semibold: 'font-semibold', bold: 'font-bold' } as const
const BUTTON_RADIUS = { pill: '9999px', rounded: '12px', square: '4px' } as const

const palette = computed(() => cookiePalette(cfg.value.design, tenant.value?.brandColor || (sandbox ? null : published!.brandColor.value)))
const titleClass = computed(() => [cfg.value.design.titleFont === 'serif' ? 'font-serif' : 'font-sans', TITLE_SIZE[cfg.value.design.titleSize], TITLE_WEIGHT[cfg.value.design.titleWeight]])

function rgba(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}
const wrapStyle = computed(() => ({
  background: rgba(palette.value.overlay, cfg.value.design.overlayOpacity / 100),
  '--cc-edge': `${cfg.value.layout.edgeOffset}px`,
}))
const cardStyle = computed(() => ({
  '--cc-bg': palette.value.background,
  '--cc-text': palette.value.text,
  '--cc-title': palette.value.title,
  '--cc-accent': palette.value.accent,
  '--cc-accent-text': palette.value.accentText,
  '--cc-border': palette.value.border,
  '--cc-link': palette.value.link,
  '--cc-radius': `${cfg.value.design.radius}px`,
  '--cc-btn-radius': BUTTON_RADIUS[cfg.value.design.buttonShape],
  '--cc-shadow': SHADOWS[cfg.value.design.shadow],
  '--cc-max-w': `${cfg.value.layout.maxWidth}px`,
  '--cc-max-h': `${cfg.value.layout.maxHeight}svh`,
}))
const transitionName = computed(() => (cfg.value.behavior.animation === 'none' ? 'cc-none' : cfg.value.behavior.animation === 'slide' ? 'cc-slide' : 'cc-fade'))

// ---------------------------------------------------------------------------
// Teclado, foco y scroll
// ---------------------------------------------------------------------------
const focusable = () => Array.from(dialog.value?.querySelectorAll<HTMLElement>('button, a[href], input') ?? []).filter((el) => !el.hasAttribute('disabled'))
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    close()
    return
  }
  if (e.key !== 'Tab') return
  // El foco no se escapa del aviso mientras está abierto (aria-modal).
  const els = focusable()
  if (!els.length) return
  const first = els[0]!
  const last = els[els.length - 1]!
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}

// Al abrir: el panel parte de la decisión vigente y el foco entra en el aviso;
// al cerrar, vuelve a donde estaba. Mientras está abierto, la página de
// detrás no se desplaza.
let previouslyFocused: HTMLElement | null = null
watch(
  () => state.value.open,
  (open) => {
    if (open) {
      syncDraft()
      if (import.meta.client) previouslyFocused = (document.activeElement as HTMLElement | null) ?? null
      nextTick(() => dialog.value?.focus())
    } else if (import.meta.client && previouslyFocused && document.contains(previouslyFocused)) {
      previouslyFocused.focus?.()
      previouslyFocused = null
    }
    if (!sandbox && import.meta.client) document.documentElement.classList.toggle('overflow-hidden', open)
  },
  { immediate: true },
)
watch(() => state.value.view, (v) => v === 'settings' && syncDraft())
// Si la decisión vigente cambia con el panel ya abierto (la muestra del
// Constructor pasa a «Guardado»), los interruptores la reflejan.
watch(choices, () => syncDraft())

onMounted(() => {
  if (!sandbox) init()
})
onBeforeUnmount(() => {
  if (!sandbox && import.meta.client) document.documentElement.classList.remove('overflow-hidden')
})
</script>

<style scoped>
/* Posición: centrado de partida; abajo a un lado; o banner a todo el ancho.
   En el móvil (< 640 px) siempre una hoja anclada abajo o, si así se
   configuró, a pantalla completa. */
.cc-wrap {
  padding: var(--cc-edge, 24px);
  align-items: flex-end;
  justify-content: center;
}
.cc-wrap[data-mobile='full'] {
  padding: 0;
}
.cc-card {
  background: var(--cc-bg);
  color: var(--cc-text);
  border-radius: var(--cc-radius);
  box-shadow: var(--cc-shadow);
  max-width: var(--cc-max-w);
  max-height: min(var(--cc-max-h), 760px);
  padding-left: var(--cc-pad-x);
  padding-right: var(--cc-pad-x);
  padding-top: var(--cc-pad-y);
  padding-bottom: calc(var(--cc-pad-y) * 0.75);
  font-size: var(--cc-font);
}
.cc-wrap[data-mobile='full'] .cc-card {
  max-width: none;
  max-height: none;
  height: 100%;
  border-radius: 0;
}
@media (min-width: 640px) {
  .cc-wrap[data-position='center'] {
    align-items: center;
  }
  .cc-wrap[data-position='bottom-right'] {
    justify-content: flex-end;
  }
  .cc-wrap[data-position='bottom-left'] {
    justify-content: flex-start;
  }
  .cc-wrap[data-position='bottom'] .cc-card {
    max-width: none;
  }
  .cc-wrap[data-mobile='full'] {
    padding: var(--cc-edge, 24px);
  }
  .cc-wrap[data-mobile='full'] .cc-card {
    max-width: var(--cc-max-w);
    max-height: min(var(--cc-max-h), 760px);
    height: auto;
    border-radius: var(--cc-radius);
  }
  .cc-wrap[data-position='bottom'][data-mobile='full'] .cc-card {
    max-width: none;
  }
}
/* Banner inferior en pantallas anchas: texto a la izquierda, botones a la derecha. */
@media (min-width: 1024px) {
  .cc-card.cc-banner {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'head actions'
      'body actions';
    column-gap: 2.5rem;
    align-items: center;
  }
  .cc-card.cc-banner .cc-head {
    grid-area: head;
  }
  .cc-card.cc-banner .cc-body {
    grid-area: body;
    padding-bottom: 0;
  }
  .cc-card.cc-banner .cc-actions {
    grid-area: actions;
    margin: 0;
    border-top: 0;
    padding: 0;
    background: transparent;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
}

/* Tamaño del texto y espacios */
.cc-size-sm {
  --cc-font: 13px;
}
.cc-size-md {
  --cc-font: 14px;
}
.cc-size-lg {
  --cc-font: 15.5px;
}
.cc-space-compact {
  --cc-pad-x: 1.25rem;
  --cc-pad-y: 1.25rem;
}
.cc-space-normal {
  --cc-pad-x: 1.5rem;
  --cc-pad-y: 1.5rem;
}
.cc-space-airy {
  --cc-pad-x: 1.75rem;
  --cc-pad-y: 1.75rem;
}
@media (min-width: 640px) {
  .cc-space-compact {
    --cc-pad-x: 1.75rem;
    --cc-pad-y: 1.5rem;
  }
  .cc-space-normal {
    --cc-pad-x: 2.25rem;
    --cc-pad-y: 2rem;
  }
  .cc-space-airy {
    --cc-pad-x: 2.75rem;
    --cc-pad-y: 2.5rem;
  }
}

.cc-title,
.cc-strong {
  color: var(--cc-title);
}
.cc-close {
  color: var(--cc-text);
}
.cc-link {
  color: var(--cc-link);
}
.cc-dot {
  background: var(--cc-text);
  opacity: 0.6;
}
.cc-icon {
  color: var(--cc-text);
  opacity: 0.75;
}
.cc-body {
  padding-top: 0.75rem;
  padding-bottom: 0.5rem;
}
.cc-cat {
  border-color: var(--cc-border);
  background: rgba(255, 255, 255, 0.55);
}
.cc-switch {
  background: #d6d3d1;
  --tw-ring-color: var(--cc-accent);
}
.peer:checked ~ .cc-switch {
  background: var(--cc-accent);
}
.cc-actions {
  margin-top: 0.5rem;
  border-top: 1px solid var(--cc-border);
  padding-top: 1.1rem;
  margin-left: calc(var(--cc-pad-x) * -1);
  margin-right: calc(var(--cc-pad-x) * -1);
  padding-left: var(--cc-pad-x);
  padding-right: var(--cc-pad-x);
  margin-bottom: calc(var(--cc-pad-y) * -0.75);
  padding-bottom: calc(var(--cc-pad-y) * 0.75);
  background: rgba(255, 255, 255, 0.35);
}

/* Botones: Rechazar y Aceptar con el mismo tamaño y la misma visibilidad */
.cookie-btn {
  @apply inline-flex min-h-[44px] items-center justify-center px-6 text-[13px] font-semibold transition-all duration-200 active:scale-[0.98];
  border-radius: var(--cc-btn-radius);
}
.cookie-btn-solid {
  background: var(--cc-accent);
  color: var(--cc-accent-text);
  border: 1px solid var(--cc-accent);
}
.cookie-btn-solid:hover {
  filter: brightness(0.92);
}
.cookie-btn-outline {
  background: #ffffff;
  color: var(--cc-title);
  border: 1px solid var(--cc-accent);
}
.cookie-btn-outline:hover {
  background: #f7f6f3;
}
.cookie-btn-quiet {
  background: #ffffff;
  color: var(--cc-text);
  border: 1px solid var(--cc-border);
}
.cookie-btn-quiet:hover {
  border-color: var(--cc-title);
  color: var(--cc-title);
}

/* Animaciones: fundido (de partida), deslizamiento o ninguna; con «reducir movimiento», ninguna. */
.cc-fade-enter-active,
.cc-fade-leave-active,
.cc-slide-enter-active,
.cc-slide-leave-active {
  transition: opacity 0.2s ease;
}
.cc-fade-enter-active .cc-card,
.cc-fade-leave-active .cc-card,
.cc-slide-enter-active .cc-card,
.cc-slide-leave-active .cc-card {
  transition: transform 0.28s var(--ease-out, ease);
}
.cc-fade-enter-from,
.cc-fade-leave-to,
.cc-slide-enter-from,
.cc-slide-leave-to {
  opacity: 0;
}
.cc-fade-enter-from .cc-card,
.cc-fade-leave-to .cc-card {
  transform: translateY(12px);
}
.cc-slide-enter-from .cc-card,
.cc-slide-leave-to .cc-card {
  transform: translateY(100%);
}
@media (prefers-reduced-motion: reduce) {
  .cc-fade-enter-active,
  .cc-fade-leave-active,
  .cc-slide-enter-active,
  .cc-slide-leave-active,
  .cc-fade-enter-active .cc-card,
  .cc-fade-leave-active .cc-card,
  .cc-slide-enter-active .cc-card,
  .cc-slide-leave-active .cc-card {
    transition: none;
  }
  .cc-fade-enter-from .cc-card,
  .cc-fade-leave-to .cc-card,
  .cc-slide-enter-from .cc-card,
  .cc-slide-leave-to .cc-card {
    transform: none;
  }
}
</style>
