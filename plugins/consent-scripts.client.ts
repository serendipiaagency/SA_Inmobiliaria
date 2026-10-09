import { CATEGORY_COOKIE_PREFIXES, revokedCategories, type OptionalCookieCategory } from '~/utils/cookieConsent'

/**
 * Lo que el aviso de cookies decide, aplicado de verdad (utils/cookieConsent.ts):
 *
 *  - Analíticas → Google Analytics 4 si la agencia lo configuró. (El recuento de
 *    visitas propio y el origen de la visita miran el consentimiento en su
 *    sitio: pages/propiedades/[slug].vue, useFavorites, utm-capture.)
 *  - Publicidad → el píxel de Meta si la agencia lo configuró.
 *  - Contenido de terceros → components/ConsentGate.vue.
 *
 * Nada se carga antes de la decisión. Al retirar una categoría se borran sus
 * cookies (las de la web y la `sa_visitor` del servidor) y, si ya había un
 * script de terceros cargado, se recarga la página para que deje de correr.
 *
 * Nunca en el panel ni en la vista previa de la web (las visitas del equipo
 * no deben acabar en la analítica de la agencia).
 */
export default defineNuxtPlugin(() => {
  if (window.location.pathname.startsWith('/admin')) return

  const consent = useCookieConsent()
  const { tenant } = useTenant()
  const router = useRouter()
  const loaded = { ga4: false, pixel: false }

  // Lo guardado se lee antes de que se monten las páginas: la ficha decide al
  // montarse si cuenta la visita con o sin cookie.
  if (tenant.value) consent.init()

  function loadGa4(id: string) {
    if (loaded.ga4) return
    loaded.ga4 = true
    const w = window as any
    w.dataLayer = w.dataLayer || []
    w.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer.push(arguments)
    }
    w.gtag('js', new Date())
    w.gtag('config', id, { anonymize_ip: true })
    const s = document.createElement('script')
    s.async = true
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`
    document.head.appendChild(s)
  }

  function loadPixel(id: string) {
    if (loaded.pixel) return
    loaded.pixel = true
    const w = window as any
    // El mismo arranque que el fragmento oficial de Meta: cola hasta que llega fbevents.js.
    const fbq: any = (...args: unknown[]) => {
      if (fbq.callMethod) fbq.callMethod(...args)
      else fbq.queue.push(args)
    }
    fbq.push = fbq
    fbq.loaded = true
    fbq.version = '2.0'
    fbq.queue = []
    w.fbq = fbq
    if (!w._fbq) w._fbq = fbq
    const s = document.createElement('script')
    s.async = true
    s.src = 'https://connect.facebook.net/en_US/fbevents.js'
    document.head.appendChild(s)
    fbq('init', id)
    fbq('track', 'PageView')
    router.afterEach(() => w.fbq?.('track', 'PageView'))
  }

  /** Borra las cookies de una categoría en el host y en sus dominios padre (donde las deja GA). */
  function clearCookies(category: OptionalCookieCategory) {
    const prefixes = CATEGORY_COOKIE_PREFIXES[category]
    if (!prefixes.length) return
    const names = document.cookie
      .split(';')
      .map((c) => c.split('=')[0]!.trim())
      .filter((n) => n && prefixes.some((p) => n === p || n.startsWith(`${p}_`)))
    const labels = window.location.hostname.split('.')
    const domains = ['', ...labels.map((_, i) => `.${labels.slice(i).join('.')}`).filter((d) => d.split('.').length > 2)]
    for (const name of names) for (const d of domains) document.cookie = `${name}=; Max-Age=0; path=/${d ? `; domain=${d}` : ''}`
  }

  function apply() {
    const record = consent.state.value.record
    if (!record || consent.preview.value) return
    const p = consent.providers.value
    if (record.c.analytics && p.ga4) loadGa4(p.ga4)
    if (record.c.marketing && p.metaPixel) loadPixel(p.metaPixel)
  }

  // Lo ya decidido en otra visita, en cuanto se lee.
  watch(() => consent.state.value.record, apply, { immediate: true })

  // Una decisión tomada ahora: además de cargar lo concedido, limpiar lo retirado.
  watch(
    () => consent.state.value.decisions,
    () => {
      const record = consent.state.value.record
      if (!record) return
      const revoked = revokedCategories(consent.state.value.previous, record.c)
      for (const c of revoked) clearCookies(c)
      // Sin analíticas, tampoco la cookie de visitante del servidor (es httpOnly:
      // sólo el servidor puede borrarla). Puede venir de antes de este aviso.
      if (!record.c.analytics) {
        clearCookies('analytics')
        $fetch('/api/public/visitor', { method: 'DELETE' }).catch(() => {})
      }
      if ((revoked.includes('analytics') && loaded.ga4) || (revoked.includes('marketing') && loaded.pixel)) window.location.reload()
    },
  )
})
