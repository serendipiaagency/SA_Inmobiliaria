import { requireOrgScope } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { logAdminAction } from '../../utils/audit'
import { getCookieProviders, saveCookieProviders } from '../../utils/siteSettings'
import { normalizeGa4Id, normalizeMetaPixelId } from '../../../utils/cookieConsent'

/**
 * PUT /api/admin/site-settings — guarda los proveedores sujetos al aviso de
 * cookies de la web de la organización activa (Constructor Web → Cookies).
 *
 * Sólo IDs con el formato real de cada proveedor (G-XXXXXXX, dígitos del
 * píxel): nada se inventa ni se completa. `askAgain` sube la revisión y el
 * aviso vuelve a salir a quien ya había decidido. Añadir o quitar un
 * proveedor también lo hace solo (utils/cookieConsent.ts › consentVersion).
 */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event, 'web', 'write')
  const body = ((await readBody(event).catch(() => null)) || {}) as Record<string, unknown>

  const ga4 = normalizeGa4Id(body.ga4)
  if (ga4 === undefined) throw createError({ statusCode: 422, statusMessage: 'El ID de Google Analytics 4 tiene la forma G-XXXXXXXXXX (lo encontrarás en Administrar → Flujos de datos).' })
  const metaPixel = normalizeMetaPixelId(body.metaPixel)
  if (metaPixel === undefined) throw createError({ statusCode: 422, statusMessage: 'El ID del píxel de Meta son sólo cifras (Administrador de eventos → Orígenes de datos).' })

  const db = useDb(event)
  const before = await getCookieProviders(db, orgId)
  const cookies = await saveCookieProviders(db, orgId, user.id, { ga4, metaPixel, askAgain: body.askAgain === true })

  const changes: string[] = []
  if (before.ga4 !== cookies.ga4) changes.push(`Google Analytics: ${before.ga4 || '—'} → ${cookies.ga4 || '—'}`)
  if (before.metaPixel !== cookies.metaPixel) changes.push(`Píxel de Meta: ${before.metaPixel || '—'} → ${cookies.metaPixel || '—'}`)
  if (cookies.revision !== before.revision) changes.push('Se vuelve a pedir el consentimiento')
  if (changes.length) await logAdminAction(event, { user, orgId, action: 'update', resource: 'site-settings', resourceId: orgId, detail: changes.join(' · ') })

  return { cookies }
})
