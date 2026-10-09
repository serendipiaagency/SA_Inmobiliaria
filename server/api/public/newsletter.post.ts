import { getRequestHeader } from 'h3'
import { useDb, resolvePublicOrgId } from '../../utils/db'
import { rateLimit } from '../../utils/rateLimit'
import { confirmSubscription, subscribeToNewsletter, unsubscribeByToken } from '../../utils/newsletter'
import { LOCALES } from '../../../i18n/messages'

/**
 * POST /api/public/newsletter — el «Suscríbete» del pie de la web.
 *
 *  - `{ email, privacyAccepted: true, locale? }`: apunta el email en el
 *    newsletter de la empresa que se visita. Sin aceptar la política de
 *    privacidad, 422. Quien ya estaba no se duplica y recibe la misma
 *    respuesta (sin enlace de baja nuevo). No se envía ningún email.
 *  - `{ action: 'unsubscribe', token }`: baja con el enlace «darse de baja».
 *  - `{ action: 'confirm', token }`: doble opt-in (preparado; hoy ningún
 *    formulario crea suscripciones pendientes).
 *
 * Como el formulario de contacto: límite por IP, tope de tamaño y campo
 * trampa `website` (un bot lo rellena; se responde como si nada).
 */
const MAX_BODY_BYTES = 4 * 1024
const LOCALE_CODES = LOCALES.map((l) => l.code) as string[]

export default defineEventHandler(async (event) => {
  await rateLimit(event, 'newsletter', { limit: 12, windowSeconds: 600 })
  if (Number(getRequestHeader(event, 'content-length') || 0) > MAX_BODY_BYTES) throw createError({ statusCode: 413, statusMessage: 'Petición demasiado grande' })
  const body = (await readBody<Record<string, unknown>>(event)) || {}
  const db = useDb(event)
  const orgId = resolvePublicOrgId(event)

  if (body.action === 'unsubscribe') {
    await unsubscribeByToken(db, orgId, body.token)
    return { ok: true, status: 'unsubscribed' }
  }
  if (body.action === 'confirm') {
    await confirmSubscription(db, orgId, body.token)
    return { ok: true, status: 'subscribed' }
  }

  if (body.website) return { ok: true, status: 'subscribed', unsubscribeToken: null }
  if (body.privacyAccepted !== true) throw createError({ statusCode: 422, statusMessage: 'Tienes que aceptar la política de privacidad' })
  const locale = typeof body.locale === 'string' && LOCALE_CODES.includes(body.locale) ? body.locale : null
  const result = await subscribeToNewsletter(db, orgId, { email: String(body.email ?? ''), locale, source: 'footer' })
  return { ok: true, status: result.status, unsubscribeToken: result.unsubscribeToken }
})
