<template>
  <!-- Sin Teleport: ya es `fixed` sobre todo, y un Teleport a <body> desde el
       layout se hidrata después que los de app.vue (ToastHost, ConfirmHost) y
       recoge su bloque del HTML del servidor: desajuste de hidratación en cada
       página pública. -->
  <Transition name="cookie-fade">
    <div
      v-if="state.open"
      class="no-print fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-3 sm:items-center sm:p-6"
      data-testid="cookie-consent"
      @click.self="close"
    >
      <div
        ref="dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
        class="cookie-card relative flex max-h-[min(92svh,760px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-[#fffdf9] text-ink shadow-[0_24px_60px_-18px_rgba(28,27,25,0.35)] outline-none"
        @keydown="onKeydown"
      >
        <!-- Parte superior -->
        <div class="flex items-start justify-between gap-4 px-6 pt-6 sm:px-9 sm:pt-8">
          <h2 :id="titleId" class="font-serif text-[22px] font-bold leading-tight sm:text-[26px]">
            {{ state.view === 'settings' ? t('cookie.settingsTitle') : t('cookie.title') }}
          </h2>
          <button
            v-if="decided || sandbox"
            type="button"
            class="-mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-stone-500 transition hover:bg-stone-100 hover:text-ink"
            :aria-label="t('cookie.close')"
            data-testid="cookie-close"
            @click="close"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        <!-- Parte central -->
        <div class="thin-scroll min-h-0 flex-1 overflow-y-auto px-6 pb-2 pt-3 text-[14px] leading-relaxed text-stone-600 sm:px-9">
          <template v-if="state.view === 'summary'">
            <p>{{ t('cookie.intro') }}</p>
            <p class="mt-3">{{ t('cookie.optionalIntro') }}</p>
            <ul class="mt-2 space-y-1.5">
              <li v-for="c in categories" :key="c" class="flex gap-2">
                <span class="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-stone-400" aria-hidden="true" />
                <span><strong class="font-semibold text-ink">{{ t(`cookie.cat.${c}.title`) }}:</strong> {{ categoryText(c) }}</span>
              </li>
            </ul>
            <p class="mt-3">{{ t('cookie.change') }}</p>
          </template>

          <div v-else class="space-y-3 pb-2" data-testid="cookie-settings">
            <p>{{ t('cookie.settingsIntro') }}</p>
            <div class="rounded-xl border border-line bg-white p-4">
              <div class="flex items-center justify-between gap-4">
                <p class="font-semibold text-ink">{{ t('cookie.cat.necessary.title') }}</p>
                <span class="shrink-0 text-[12px] font-medium text-stone-500">{{ t('cookie.alwaysOn') }}</span>
              </div>
              <p class="mt-1 text-[13px]">{{ t('cookie.cat.necessary.desc') }}</p>
            </div>
            <div v-for="c in categories" :key="c" class="rounded-xl border border-line bg-white p-4">
              <label class="flex cursor-pointer items-center justify-between gap-4">
                <span class="font-semibold text-ink">{{ t(`cookie.cat.${c}.title`) }}</span>
                <span class="relative inline-flex shrink-0 items-center">
                  <input v-model="draft[c]" type="checkbox" role="switch" class="peer sr-only" :data-testid="`cookie-toggle-${c}`" >
                  <span class="h-6 w-11 rounded-full bg-stone-300 transition peer-checked:bg-ink peer-focus-visible:ring-2 peer-focus-visible:ring-ink peer-focus-visible:ring-offset-2" />
                  <span class="pointer-events-none absolute left-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
                </span>
              </label>
              <p class="mt-1 text-[13px]">{{ categoryText(c) }}</p>
            </div>
          </div>

          <p class="mt-3 text-[13px]">
            <span v-if="controller">{{ t('cookie.controller') }} {{ controller }}. </span>
            <NuxtLink to="/cookies" class="font-medium text-ink underline underline-offset-2" data-testid="cookie-policy-link" @click="leaveForPolicy">{{ t('cookie.policy') }}</NuxtLink>
            ·
            <NuxtLink to="/privacidad" class="font-medium text-ink underline underline-offset-2" @click="leaveForPolicy">{{ t('cookie.privacy') }}</NuxtLink>
          </p>
        </div>

        <!-- Parte inferior: aceptar y rechazar con el mismo tamaño y la misma visibilidad -->
        <div class="mt-2 flex flex-col-reverse gap-2.5 border-t border-line bg-white/60 px-6 py-5 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-9">
          <template v-if="state.view === 'summary'">
            <button type="button" class="cookie-btn cookie-btn-quiet sm:mr-auto" data-testid="cookie-configure" @click="openSettingsView">{{ t('cookie.configure') }}</button>
            <button type="button" class="cookie-btn cookie-btn-outline" data-testid="cookie-reject" @click="rejectAll">{{ t('cookie.reject') }}</button>
            <button type="button" class="cookie-btn cookie-btn-solid" data-testid="cookie-accept" @click="acceptAll">{{ t('cookie.accept') }}</button>
          </template>
          <template v-else>
            <button type="button" class="cookie-btn cookie-btn-quiet sm:mr-auto" data-testid="cookie-back" @click="state.view = 'summary'">{{ t('cookie.back') }}</button>
            <button type="button" class="cookie-btn cookie-btn-outline" data-testid="cookie-reject-settings" @click="rejectAll">{{ t('cookie.reject') }}</button>
            <button type="button" class="cookie-btn cookie-btn-solid" data-testid="cookie-save" @click="saveDraft">{{ t('cookie.save') }}</button>
          </template>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { allChoices, type CookieChoices, type OptionalCookieCategory } from '~/utils/cookieConsent'

/**
 * Aviso de consentimiento de cookies de la web pública: modal centrado sobre
 * la web oscurecida, «Configurar | Rechazar | Aceptar y continuar», panel de
 * preferencias por categoría y «Guardar preferencias». El estado vive en
 * useCookieConsent; lo que se carga o se bloquea según la decisión, en
 * plugins/consent-scripts.client.ts y components/ConsentGate.vue.
 *
 * `sandbox`: la muestra del Constructor Web (lienzo) — funciona igual, pero
 * no guarda nada y no carga ningún proveedor.
 */
const props = defineProps<{ sandbox?: boolean }>()

const { t } = useI18n()
const { tenant } = useTenant()
const sandbox = Boolean(props.sandbox)
const { state, categories, choices, decided, providers, acceptAll, rejectAll, save, close, init } = useCookieConsent(sandbox ? 'sandbox' : 'site')
const titleId = `cookie-title-${sandbox ? 'sb' : 'site'}`
const dialog = ref<HTMLElement | null>(null)

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
const controller = computed(() => (sandbox ? '' : tenant.value?.legalCompanyName || tenant.value?.companyName || tenant.value?.name || ''))

function categoryText(c: OptionalCookieCategory): string {
  if (c === 'analytics' && providers.value.ga4) return `${t('cookie.cat.analytics.desc')} ${t('cookie.cat.analytics.ga')}`
  return t(`cookie.cat.${c}.desc`)
}

// Leer la política no es decidir: el aviso se aparta para dejarla leer y
// vuelve a salir en la página siguiente si sigue sin decisión.
function leaveForPolicy() {
  if (!decided.value && !sandbox) state.value.open = false
}

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

// Al abrir: el panel parte de la decisión vigente y el foco entra en el aviso.
// Mientras está abierto, la página de detrás no se desplaza.
watch(
  () => state.value.open,
  (open) => {
    if (open) {
      syncDraft()
      nextTick(() => dialog.value?.focus())
    }
    if (!sandbox && import.meta.client) document.documentElement.classList.toggle('overflow-hidden', open)
  },
  { immediate: true },
)
watch(() => state.value.view, (v) => v === 'settings' && syncDraft())

onMounted(() => {
  if (!sandbox) init()
})
onBeforeUnmount(() => {
  if (!sandbox && import.meta.client) document.documentElement.classList.remove('overflow-hidden')
})
</script>

<style scoped>
.cookie-btn {
  @apply inline-flex min-h-[44px] items-center justify-center rounded-full px-6 text-[13px] font-semibold transition-all duration-200 active:scale-[0.98];
}
.cookie-btn-solid {
  @apply bg-ink text-white hover:bg-black;
}
.cookie-btn-outline {
  @apply border border-ink bg-white text-ink hover:bg-stone-50;
}
.cookie-btn-quiet {
  @apply border border-line bg-white text-stone-600 hover:border-ink hover:text-ink;
}
.cookie-fade-enter-active,
.cookie-fade-leave-active {
  transition: opacity 0.2s ease;
}
.cookie-fade-enter-active .cookie-card,
.cookie-fade-leave-active .cookie-card {
  transition: transform 0.25s var(--ease-out);
}
.cookie-fade-enter-from,
.cookie-fade-leave-to {
  opacity: 0;
}
.cookie-fade-enter-from .cookie-card,
.cookie-fade-leave-to .cookie-card {
  transform: translateY(12px);
}
</style>
