import {
  NO_COOKIE_PROVIDERS,
  consentStorageKey,
  allChoices,
  availableCategories,
  buildConsent,
  parseConsent,
  type ConsentRecord,
  type CookieChoices,
  type CookieProviders,
  type OptionalCookieCategory,
} from '~/utils/cookieConsent'

interface ConsentState {
  /** Ya se leyó lo guardado (sólo en el navegador). */
  ready: boolean
  record: ConsentRecord | null
  open: boolean
  view: 'summary' | 'settings'
  /** La decisión anterior a la última, para saber qué se retiró. */
  previous: CookieChoices | null
  /** Cuántas decisiones se han tomado en esta página (no cuenta la leída al cargar). */
  decisions: number
}

/**
 * Estado del consentimiento de cookies de la web pública (utils/cookieConsent.ts).
 *
 * `scope: 'sandbox'` es el aviso de muestra del Constructor Web: funciona
 * igual (Configurar, Rechazar, Aceptar, Guardar preferencias) pero no guarda
 * nada ni carga ningún proveedor — sirve para revisarlo sin tocar el
 * consentimiento de nadie. Sus proveedores los manda el Constructor.
 *
 * En la vista previa de la web (`tenant.preview`) la elección se guarda en una
 * clave aparte, de modo que lo que el equipo pruebe ahí no cuenta como su
 * decisión en la web real; y la analítica no se carga, para que sus visitas
 * no ensucien las estadísticas. «Configurar cookies» del pie la vuelve a abrir.
 */
export function useCookieConsent(scope: 'site' | 'sandbox' = 'site') {
  const sandbox = scope === 'sandbox'
  const nuxtApp = useNuxtApp()
  const state = useState<ConsentState>(`cookie-consent-${scope}`, () => ({ ready: false, record: null, open: false, view: 'summary', previous: null, decisions: 0 }))
  const sandboxProviders = useState<CookieProviders>('cookie-consent-sandbox-providers', () => NO_COOKIE_PROVIDERS)
  const { tenant } = useTenant()

  const providers = computed<CookieProviders>(() => (sandbox ? sandboxProviders.value : tenant.value?.cookies ?? NO_COOKIE_PROVIDERS))
  const org = computed(() => (sandbox ? 0 : tenant.value?.id ?? 0))
  const preview = computed(() => !sandbox && Boolean(tenant.value?.preview))
  const categories = computed(() => availableCategories(providers.value))
  const choices = computed<CookieChoices>(() => state.value.record?.c ?? allChoices(false))
  const decided = computed(() => state.value.record !== null)

  function storage(): Storage | null {
    if (sandbox || !import.meta.client) return null
    try {
      return window.localStorage
    } catch {
      return null // almacenamiento bloqueado por el navegador: el aviso saldrá en cada página
    }
  }
  const storageKey = () => consentStorageKey(preview.value)

  /** Lee lo guardado y abre el aviso si no hay una decisión válida. Sólo en el navegador. */
  function init() {
    if (state.value.ready || !import.meta.client) return
    let raw: string | null
    try {
      raw = storage()?.getItem(storageKey()) ?? null
    } catch {
      raw = null // almacenamiento bloqueado: como si no hubiera decisión
    }
    state.value.record = parseConsent(raw, preview.value ? null : org.value, providers.value)
    state.value.ready = true
    if (!state.value.record) {
      state.value.view = 'summary'
      // Nunca a mitad de la hidratación: el servidor no lo pintó (no sabe qué
      // decidió el visitante) y abrirlo ya descuadraría el HTML recibido.
      const show = () => {
        if (!state.value.record) state.value.open = true
      }
      if (nuxtApp.isHydrating) nuxtApp.hooks.hookOnce('app:suspense:resolve', show)
      else show()
    }
  }

  /** Vuelve a leer (otra versión de la política, otra web en el mismo origen). */
  function reset() {
    state.value.ready = false
    state.value.record = null
    state.value.open = false
    init()
  }

  function save(next: Partial<CookieChoices>) {
    const record = buildConsent(org.value, providers.value, next)
    state.value.previous = state.value.record?.c ?? null
    state.value.record = record
    state.value.open = false
    state.value.decisions++
    try {
      storage()?.setItem(storageKey(), JSON.stringify(record))
    } catch {
      // Sin almacenamiento la decisión vale para esta página y el aviso vuelve en la siguiente.
    }
  }

  const acceptAll = () => save(allChoices(true))
  const rejectAll = () => save(allChoices(false))
  /** «Permitir» desde un contenido bloqueado: concede sólo esa categoría. */
  const grant = (category: OptionalCookieCategory) => save({ ...choices.value, [category]: true })

  /** «Configurar cookies» del pie: abre directamente las preferencias. */
  function openSettings() {
    state.value.view = 'settings'
    state.value.open = true
  }
  function openSummary() {
    state.value.view = 'summary'
    state.value.open = true
  }
  /** Sólo se puede cerrar sin elegir cuando ya hay una decisión guardada. */
  function close() {
    if (decided.value || sandbox) state.value.open = false
  }

  return { state, sandbox, sandboxProviders, providers, org, preview, categories, choices, decided, init, reset, save, acceptAll, rejectAll, grant, openSettings, openSummary, close }
}
