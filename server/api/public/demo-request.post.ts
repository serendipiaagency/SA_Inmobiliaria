import { getRequestHeader } from 'h3'
import { useDb, cfEnv, DEFAULT_PUBLIC_ORG_ID } from '../../utils/db'
import { claimOnce, rateLimit } from '../../utils/rateLimit'
import { getRequestId } from '../../utils/requestId'
import { createDemoRequest, demoInterestLabel, demoTeamSizeLabel, validateDemoRequest } from '../../utils/demoRequests'
import { platformAdminRecipients, sendPlatformEmail, summarizeEmailResults } from '../../utils/email/platform'
import { platformBaseUrl } from '../../utils/email/links'

/**
 * POST /api/public/demo-request — «Solicitar demo» de la landing comercial
 * de INMO (components/landing/LpDemo.vue).
 *
 * Guarda la solicitud en platform_demo_requests (de la plataforma: no crea
 * ningún lead en el CRM de ninguna inmobiliaria), confirma por correo a quien
 * la pidió y avisa a los super admins, los dos con la identidad de Portal INMO
 * (server/utils/email/platform.ts). Si el correo no se puede enviar, la
 * solicitud queda guardada igual y la respuesta lo dice tal cual.
 *
 * Protección: límite por IP, tope de tamaño del cuerpo, campo trampa
 * `website` (un bot lo rellena, una persona no lo ve), consentimiento
 * obligatorio y `submissionId` para que un doble clic no la cree dos veces.
 */
const MAX_BODY_BYTES = 16 * 1024
const SUBMISSION_ID = /^[A-Za-z0-9_-]{8,64}$/

export default defineEventHandler(async (event) => {
  await rateLimit(event, 'demo-request', { limit: 5, windowSeconds: 600 })
  if (Number(getRequestHeader(event, 'content-length') || 0) > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Mensaje demasiado largo' })
  }
  const body = await readBody<Record<string, any>>(event)
  // Campo trampa: se responde como si nada para no enseñarle al bot qué le ha delatado.
  if (body?.website) return { ok: true, name: '', email: '', confirmationEmail: 'none' }

  const input = validateDemoRequest(body)
  if (typeof body?.submissionId === 'string' && SUBMISSION_ID.test(body.submissionId)) {
    if (!(await claimOnce(event, `demo-request:${body.submissionId}`))) {
      return { ok: true, duplicate: true, name: input.name, email: input.email, confirmationEmail: 'none' }
    }
  }

  const db = useDb(event)
  const env = cfEnv(event) as Record<string, any>
  const requestId = getRequestId(event)
  const { id, createdAt } = await createDemoRequest(db, input, requestId)

  const base = platformBaseUrl(event)
  const requestedAt = createdAt.replace('T', ' ').slice(0, 16)
  const locale = input.locale?.startsWith('en') ? 'en' : 'es'

  // Confirmación a quien la pidió. `once` por si la petición se reintenta.
  let confirmationEmail: ReturnType<typeof summarizeEmailResults> = 'none'
  try {
    const results = await sendPlatformEmail(db, env, {
      organizationId: DEFAULT_PUBLIC_ORG_ID,
      template: 'demo_request_received',
      to: input.email,
      locale,
      data: { name: input.name, email: input.email, company: input.company, requestedAt, landingUrl: `${base}/` },
      requestId,
    })
    confirmationEmail = summarizeEmailResults(results)
  } catch (e) {
    console.error('[demo-request] confirmación', e instanceof Error ? e.message : e)
    confirmationEmail = 'failed'
  }

  // Aviso a quien administra la plataforma (nunca a los admins de las empresas).
  try {
    const admins = await platformAdminRecipients(db, env)
    if (admins.length) {
      await sendPlatformEmail(db, env, {
        organizationId: DEFAULT_PUBLIC_ORG_ID,
        template: 'admin_demo_requested',
        to: admins,
        data: {
          name: input.name,
          company: input.company,
          email: input.email,
          phone: input.phone,
          teamSize: demoTeamSizeLabel(input.teamSize),
          interest: demoInterestLabel(input.interest),
          message: input.message,
          requestedAt,
          adminUrl: `${base}/admin/solicitudes-demo?id=${id}`,
        },
        requestId,
      })
    }
  } catch (e) {
    console.error('[demo-request] aviso a super admins', e instanceof Error ? e.message : e)
  }

  return { ok: true, id, name: input.name, email: input.email, confirmationEmail }
})
