/**
 * Primer contacto (FASE 12, migración 0069): captura utm_source/medium/
 * campaign/content/term, la página de aterrizaje y el referrer EXTERNO en la
 * primera página que alguien visita de la web pública, y los deja en una
 * cookie propia (`sa_ft`) durante 30 días.
 *
 * Sólo se escribe una vez por sesión de navegador: si ya existe la cookie, no
 * se sobrescribe — así un visitante que llegó por una campaña y navega varias
 * páginas hasta rellenar el formulario de contacto no pierde el origen real
 * por el que llegó. `server/api/public/contact.post.ts` (y el resto de
 * formularios públicos) la lee para rellenar el Lead — "no perder UTMs
 * durante la conversión" es justo lo que esto evita.
 *
 * Cliente únicamente: SSR no tiene document.referrer ni el historial de
 * navegación del visitante.
 */
export default defineNuxtPlugin(() => {
  if (!import.meta.client) return

  const existing = useCookie<string | null>('sa_ft', { maxAge: 60 * 60 * 24 * 30, sameSite: 'lax', path: '/' })
  if (existing.value) return

  const params = new URLSearchParams(window.location.search)
  const utm: Record<string, string> = {}
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const value = params.get(key)
    if (value) utm[key] = value.slice(0, 200)
  }

  // Un referrer del propio sitio no dice nada sobre de dónde vino la visita
  // — sólo interesa el origen externo (buscador, anuncio, otra web).
  let referrer = ''
  try {
    if (document.referrer && new URL(document.referrer).origin !== window.location.origin) {
      referrer = document.referrer.slice(0, 500)
    }
  } catch {
    // document.referrer malformado — se deja vacío en vez de romper la carga de la página.
  }

  const hasSignal = Object.keys(utm).length > 0 || !!referrer
  if (!hasSignal) return // Nada que capturar: visita directa sin campaña ni referrer externo.

  existing.value = JSON.stringify({
    ...utm,
    landing_page: window.location.pathname.slice(0, 300),
    referrer,
  })
})
