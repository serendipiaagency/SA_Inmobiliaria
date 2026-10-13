<template>
  <Transition :name="transitionName">
    <aside
      v-if="visible"
      role="note"
      :aria-label="title"
      class="dn no-print fixed z-[60] flex items-start gap-3"
      :class="[`dn-${cfg.design.size}`, selectable ? 'cursor-default' : '']"
      :style="style"
      :data-position="cfg.position"
      data-testid="demo-notice"
      @click="selectable && emit('select')"
    >
      <span v-if="cfg.icon !== 'none'" class="dn-icon mt-0.5 flex shrink-0 items-center justify-center rounded-full" aria-hidden="true">
        <svg v-if="cfg.icon === 'info'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9" /><path stroke-linecap="round" d="M12 11v5M12 8h.01" /></svg>
        <svg v-else-if="cfg.icon === 'flask'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 3h6M10 3v6.5L4.6 18.4A2 2 0 0 0 6.3 21.5h11.4a2 2 0 0 0 1.7-3.1L14 9.5V3" /><path stroke-linecap="round" d="M7.5 15h9" /></svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
      </span>
      <div class="min-w-0 flex-1">
        <p class="dn-title font-semibold leading-snug" data-testid="demo-notice-title">{{ title }}</p>
        <p class="dn-text mt-0.5 leading-snug opacity-90">{{ body }}</p>
      </div>
      <button
        v-if="cfg.closable"
        type="button"
        class="dn-close -mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:bg-white/15"
        :aria-label="t('demo.notice.close')"
        data-testid="demo-notice-close"
        @click.stop="dismiss"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
import { demoNoticeStorageKey, demoPalette, demoText, normalizeDemoNotice, SHADOWS, type DemoNoticeConfig } from '~/utils/siteConsent'
import { TENANT_BRANDING_OVERRIDE } from '~/composables/useTenant'

/**
 * Aviso de demostración de la web pública: una tarjeta compacta, fija en una
 * esquina (de partida arriba a la izquierda, debajo de la cabecera), que dice
 * que la web es de ejemplo y que nada sale de la plataforma. Sólo existe en
 * la web de una cuenta de demostración: lo decide el servidor
 * (`tenant.isDemo`, server/utils/demo/tenant.ts), no un ajuste. La agencia
 * configura su aspecto en el Constructor (utils/siteConsent.ts), y puede
 * desactivarlo; no es un aviso legal, así que sí se puede ocultar.
 *
 * Nunca es una franja que empuje la cabecera (la web se ve tal cual) ni tapa
 * el menú: en las posiciones de arriba se coloca debajo de la cabecera real.
 * Capa 60: por encima del chat (45) y de la cabecera (40), por debajo del
 * aviso de cookies (70).
 *
 * `sandbox`: la muestra del lienzo del Constructor, con el borrador por
 * `config`; `forceShow` la enseña aunque la empresa no sea una demo.
 */
const props = withDefaults(defineProps<{ sandbox?: boolean; config?: DemoNoticeConfig | null; forceShow?: boolean; selectable?: boolean }>(), {
  sandbox: false,
  config: null,
  forceShow: false,
  selectable: false,
})
const emit = defineEmits<{ select: [] }>()

const { t, locale } = useI18n()
const { tenant: hostTenant } = useTenant()
const override = inject(TENANT_BRANDING_OVERRIDE, ref(null))
const sandbox = Boolean(props.sandbox)
const tenant = computed(() => (sandbox ? override.value : hostTenant.value))

const published = sandbox ? null : await useSiteConsent()
const cfg = computed<DemoNoticeConfig>(() => (sandbox ? normalizeDemoNotice(props.config) : published!.config.value.demo))
const title = computed(() => demoText(cfg.value, locale.value, 'title', (k) => t(k)))
const body = computed(() => demoText(cfg.value, locale.value, 'text', (k) => t(k)))

// Sólo en el navegador (el servidor no sabe si se cerró), y sólo en una demo.
const mounted = ref(false)
const closed = ref(false)
const isDemo = computed(() => (sandbox ? props.forceShow || Boolean(tenant.value?.isDemo) : Boolean(tenant.value?.isDemo)))
const visible = computed(() => mounted.value && cfg.value.enabled && isDemo.value && !closed.value)

function storageFor(mode: DemoNoticeConfig['rememberClose']): Storage | null {
  if (sandbox || !import.meta.client || mode === 'never') return null
  try {
    return mode === 'always' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}
const storageKey = () => demoNoticeStorageKey(tenant.value?.id ?? 0)
function readClosed() {
  try {
    closed.value = Boolean(storageFor(cfg.value.rememberClose)?.getItem(storageKey()))
  } catch {
    closed.value = false
  }
}
function dismiss() {
  closed.value = true
  try {
    storageFor(cfg.value.rememberClose)?.setItem(storageKey(), new Date().toISOString())
  } catch {
    // Sin almacenamiento, el cierre vale para esta página.
  }
}
// En el lienzo, el borrador cambia en vivo: si se vuelve a activar, vuelve a verse.
watch(
  () => [cfg.value.enabled, props.forceShow],
  () => {
    if (sandbox) closed.value = false
  },
)

// ---------------------------------------------------------------------------
// Posición: nunca sobre la cabecera (arriba se coloca debajo de ella)
// ---------------------------------------------------------------------------
const headerBottom = ref(0)
function measureHeader() {
  const header = document.querySelector('header')
  headerBottom.value = header ? Math.max(0, Math.round(header.getBoundingClientRect().bottom)) : 0
}
const palette = computed(() => demoPalette(cfg.value.design))
const style = computed(() => {
  const off = `${cfg.value.offset}px`
  const top = cfg.value.position.startsWith('top')
  const s: Record<string, string> = {
    '--dn-bg': palette.value.background,
    '--dn-text': palette.value.text,
    '--dn-icon': palette.value.icon,
    '--dn-radius': `${cfg.value.design.radius}px`,
    '--dn-shadow': SHADOWS[cfg.value.design.shadow],
    '--dn-max-w': `${cfg.value.design.maxWidth}px`,
    '--dn-off': off,
  }
  if (top) s.top = `calc(${headerBottom.value}px + ${off})`
  else s.bottom = off
  if (cfg.value.position.endsWith('right')) s.right = off
  else s.left = off
  return s
})
const transitionName = computed(() => (cfg.value.animation === 'none' ? 'dn-none' : cfg.value.animation === 'slide' ? 'dn-slide' : 'dn-fade'))

onMounted(() => {
  readClosed()
  measureHeader()
  window.addEventListener('resize', measureHeader)
  mounted.value = true
})
onBeforeUnmount(() => window.removeEventListener('resize', measureHeader))
</script>

<style scoped>
.dn {
  background: var(--dn-bg);
  color: var(--dn-text);
  border-radius: var(--dn-radius);
  box-shadow: var(--dn-shadow);
  max-width: min(var(--dn-max-w), calc(100vw - var(--dn-off) * 2));
  width: calc(100vw - var(--dn-off) * 2);
}
@media (min-width: 640px) {
  .dn {
    width: auto;
  }
}
.dn-md {
  padding: 0.85rem 1rem;
  font-size: 13px;
}
.dn-sm {
  padding: 0.6rem 0.8rem;
  font-size: 12px;
}
.dn-icon {
  color: var(--dn-icon);
  background: rgba(255, 255, 255, 0.14);
  width: 1.75rem;
  height: 1.75rem;
}
.dn-sm .dn-icon {
  width: 1.5rem;
  height: 1.5rem;
}
.dn-icon svg {
  width: 1rem;
  height: 1rem;
}
.dn-close {
  color: var(--dn-text);
}
.dn-fade-enter-active,
.dn-fade-leave-active,
.dn-slide-enter-active,
.dn-slide-leave-active {
  transition: opacity 0.22s ease, transform 0.28s var(--ease-out, ease);
}
.dn-fade-enter-from,
.dn-fade-leave-to,
.dn-slide-enter-from,
.dn-slide-leave-to {
  opacity: 0;
}
.dn-slide-enter-from,
.dn-slide-leave-to {
  transform: translateY(-12px);
}
.dn[data-position^='bottom'].dn-slide-enter-from,
.dn[data-position^='bottom'].dn-slide-leave-to {
  transform: translateY(12px);
}
@media (prefers-reduced-motion: reduce) {
  .dn-fade-enter-active,
  .dn-fade-leave-active,
  .dn-slide-enter-active,
  .dn-slide-leave-active {
    transition: none;
  }
  .dn-slide-enter-from,
  .dn-slide-leave-to {
    transform: none;
  }
}
</style>
