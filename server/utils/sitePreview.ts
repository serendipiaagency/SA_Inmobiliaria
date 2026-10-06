import { eq } from 'drizzle-orm'
import { deleteCookie, getCookie, getQuery, getRequestURL, setCookie, setResponseHeader, type H3Event } from 'h3'
import { useDb, schema } from './db'
import { getSessionUser } from './auth'

/**
 * Vista previa de la web pública de una empresa SIN dominio propio.
 *
 * Una empresa sólo tiene web pública cuando se le asigna un dominio
 * (00.tenant.ts). Hasta entonces, «Ver sitio público» del panel abre el
 * dominio principal con `?vista_previa=<id>`: si quien lo pide tiene sesión
 * en ESA empresa (o es super admin), esa navegación —y las llamadas a la API
 * pública que hace la propia web— se sirven como esa empresa.
 *
 * - Nadie más la ve: sin sesión de la empresa, la cookie se ignora y se borra.
 * - Nada se cachea ni se indexa: `Cache-Control: private, no-store` y
 *   `X-Robots-Tag: noindex`, para que el dominio principal nunca sirva a un
 *   visitante la web de otra empresa.
 * - `?vista_previa=salir` vuelve a la web del dominio principal.
 * - El parámetro sólo fija la cookie y redirige a la misma dirección sin él:
 *   así toda la página —también lo que el servidor pide a la API pública al
 *   pintarla— se sirve ya como esa empresa desde la primera carga.
 */

export const SITE_PREVIEW_COOKIE = 'site_preview'
export const SITE_PREVIEW_PARAM = 'vista_previa'

export interface PreviewOrg {
  id: number
  name: string
  companyName: string | null
  logo: string | null
  brandColor: string | null
}

/** La misma dirección sin el parámetro de la vista previa. */
function withoutPreviewParam(event: H3Event): string {
  const url = getRequestURL(event)
  url.searchParams.delete(SITE_PREVIEW_PARAM)
  return `${url.pathname}${url.search}${url.hash}`
}

export async function applySitePreview(event: H3Event): Promise<{ org: PreviewOrg | null; redirect: string | null }> {
  const param = getQuery(event)[SITE_PREVIEW_PARAM]
  if (param === 'salir') {
    deleteCookie(event, SITE_PREVIEW_COOKIE, { path: '/' })
    return { org: null, redirect: withoutPreviewParam(event) }
  }
  const fromParam = Number(param)
  const fromCookie = Number(getCookie(event, SITE_PREVIEW_COOKIE))
  const orgId = Number.isInteger(fromParam) && fromParam > 0 ? fromParam : Number.isInteger(fromCookie) && fromCookie > 0 ? fromCookie : null
  if (!orgId) return { org: null, redirect: null }

  const user = await getSessionUser(event).catch(() => null)
  const allowed = Boolean(user && (user.role === 'super_admin' || user.organizationId === orgId))
  if (!allowed) {
    if (fromCookie) deleteCookie(event, SITE_PREVIEW_COOKIE, { path: '/' })
    return { org: null, redirect: null }
  }

  const [org] = await useDb(event)
    .select({ id: schema.organizations.id, name: schema.organizations.name, companyName: schema.organizations.companyName, logo: schema.organizations.logo, brandColor: schema.organizations.brandColor })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, orgId))
    .limit(1)
  if (!org) {
    deleteCookie(event, SITE_PREVIEW_COOKIE, { path: '/' })
    return { org: null, redirect: null }
  }

  if (fromParam) {
    setCookie(event, SITE_PREVIEW_COOKIE, String(org.id), { path: '/', httpOnly: true, sameSite: 'lax', secure: getRequestURL(event).protocol === 'https:' })
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    return { org, redirect: withoutPreviewParam(event) }
  }
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  setResponseHeader(event, 'X-Robots-Tag', 'noindex, nofollow')
  ;(event.context as any).sitePreview = true
  return { org, redirect: null }
}
