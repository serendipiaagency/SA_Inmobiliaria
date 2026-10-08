import { getRequestHeader } from 'h3'
import { useDb, schema, now, resolvePublicOrgId, cfEnv } from '../../utils/db'
import { upsertLead } from '../../utils/leads'
import { claimOnce, rateLimit } from '../../utils/rateLimit'
import { isValidPhone, requireValidEmail } from '../../utils/validate'
import { sendInternalNotification } from '../../utils/email/send'
import { platformBaseUrl } from '../../utils/email/links'
import { getRequestId } from '../../utils/requestId'
import { readFirstTouch } from '../../utils/firstTouch'
import { recordWebFormSubmission } from '../../utils/comms/web'
import { handlePublicWebChat, publicPropertyBySlug, samePagePath } from '../../utils/comms/webPublic'
import { publicLeadLanguage } from '../../utils/leads/captureLanguage'

/**
 * POST /api/public/contact — formulario de contacto (y de captación del
 * Constructor Web) y reclamaciones.
 *
 * Núcleo N8a (FASE 29):
 *   - Cada envío de contacto queda además como hilo «Formulario web» en la
 *     bandeja de Comunicaciones, vinculado a su lead, a su Contact y, con
 *     `propertySlug`, a la propiedad (server/utils/comms/web.ts).
 *   - `?channel=chat&action=start|send|poll` es el chat de la web pública
 *     (server/utils/comms/webPublic.ts): una rama de este endpoint y no una
 *     ruta nueva (presupuesto de rutas de Nitro = 0). Su límite de tasa se
 *     aplica antes de leer el cuerpo, igual que el del formulario.
 *
 * Cierre del núcleo: el lead llega con el idioma de quien escribe
 * (`language`, ver server/utils/leads/captureLanguage.ts) y con el catálogo
 * de su propiedad (la web pública sólo enseña obra nueva: `developer`).
 *
 * Formulario «Atendido por» de la ficha de una propiedad (`form: 'property'`):
 *   - la propiedad es obligatoria y tiene que ser de esta agencia y pública
 *     (si no, 422: nada de leads «sueltos» desde una ficha);
 *   - exige la aceptación de la política de privacidad (`privacyAccepted`),
 *     que queda registrada con su fecha en el hilo de la bandeja;
 *   - un lead por persona y propiedad: si la misma persona pregunta por otra
 *     propiedad es otro lead (mismo Contact); si vuelve a preguntar por la
 *     misma, se reutiliza;
 *   - si ninguna regla de enrutado lo asigna, va al comercial responsable de
 *     la propiedad, el que la ficha enseña como «Atendido por».
 *
 * Para todos los formularios: campo trampa `website` (un bot lo rellena, una
 * persona no lo ve), `submissionId` para que un doble clic no cree dos veces
 * lo mismo, y un tope de tamaño del cuerpo antes de leerlo.
 */
const MAX_BODY_BYTES = 32 * 1024
const SUBMISSION_ID = /^[A-Za-z0-9_-]{8,64}$/
export default defineEventHandler(async (event) => {
  if (getQuery(event).channel === 'chat') return handlePublicWebChat(event)

  await rateLimit(event, 'contact', { limit: 5, windowSeconds: 600 })

  if (Number(getRequestHeader(event, 'content-length') || 0) > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Mensaje demasiado largo' })
  }
  const body = await readBody<Record<string, any>>(event)
  // Campo trampa: invisible para una persona. Se responde como si nada para no
  // enseñarle al bot qué le ha delatado, y no se guarda nada.
  if (body?.website) return { ok: true }
  const { name, message } = body || {}
  if (!name || !body?.email || !message) {
    throw createError({ statusCode: 422, statusMessage: 'name, email and message are required' })
  }
  const email = requireValidEmail(body.email)
  const type = body.type === 'complaint' ? 'complaint' : 'contact'
  const form: 'contact' | 'lead_form' | 'property' = body.form === 'lead_form' ? 'lead_form' : body.form === 'property' ? 'property' : 'contact'
  if (form === 'property' && body.privacyAccepted !== true) {
    throw createError({ statusCode: 422, statusMessage: 'Tienes que aceptar la política de privacidad' })
  }
  // El teléfono es opcional, pero si llega desde la ficha tiene que parecer un teléfono.
  if (form === 'property' && body.phone && !isValidPhone(String(body.phone))) {
    throw createError({ statusCode: 422, statusMessage: 'Revisa el teléfono' })
  }
  const orgId = resolvePublicOrgId(event)
  const db = useDb(event)
  // La propiedad de la ficha: de esta agencia, pública y fuera de la papelera.
  const property = type === 'contact' ? await publicPropertyBySlug(db, orgId, body.propertySlug).catch(() => null) : null
  if (form === 'property' && !property) {
    throw createError({ statusCode: 422, statusMessage: 'Esta propiedad ya no está disponible' })
  }
  // Un doble clic o un reintento con el mismo envío no crea nada dos veces.
  if (typeof body.submissionId === 'string' && SUBMISSION_ID.test(body.submissionId)) {
    if (!(await claimOnce(event, `contact:${orgId}:${body.submissionId}`))) return { ok: true, duplicate: true }
  }
  await db.insert(schema.contactMessages).values({
    organizationId: orgId,
    type,
    name: String(name).slice(0, 200),
    email: String(email).slice(0, 200),
    phone: body.phone ? String(body.phone).slice(0, 50) : null,
    subject: body.subject ? String(body.subject).slice(0, 300) : null,
    message: String(message).slice(0, 5000),
    createdAt: now(),
  })

  // Sales enquiries become CRM leads (which sends its own internal
  // notification, see server/utils/leads.ts); complaints are support issues,
  // not prospects, so they get their own internal notification here instead.
  if (type === 'contact') {
    let leadId: number | null = null
    let leadCreated = false
    try {
      const firstTouch = readFirstTouch(event)
      const lead = await upsertLead(event, {
        organizationId: orgId,
        name: String(name).slice(0, 200),
        email: String(email).slice(0, 200),
        phone: body.phone ? String(body.phone).slice(0, 50) : null,
        source: 'web',
        ...(form === 'property' ? { sourceDetail: 'Ficha de propiedad' } : {}),
        notes: body.subject ? String(body.subject).slice(0, 300) : null,
        originalMessage: String(message).slice(0, 5000),
        language: publicLeadLanguage(event, body.language),
        ...(property ? { propertyId: property.id, propertyKind: 'developer' as const, propertyName: property.name } : {}),
        ...firstTouch,
      }, form === 'property' ? { reuse: 'same_property', routingFallback: 'property_responsible' } : {})
      leadId = lead?.id ?? null
      leadCreated = !!lead?.created
    } catch {
      // Lead pipeline must never block the visitor's message from being saved.
    }
    try {
      await recordWebFormSubmission(db, {
        orgId,
        formType: form,
        leadId,
        name: String(name),
        email,
        phone: body.phone ? String(body.phone) : null,
        message: String(message),
        fields: {
          subject: body.subject ? String(body.subject).slice(0, 300) : null,
          // Constancia del consentimiento: qué se aceptó y cuándo.
          ...(form === 'property' ? { privacyAcceptedAt: now(), privacyPolicyUrl: '/privacidad' } : {}),
        },
        propertyId: property?.id ?? null,
        propertyKind: property ? 'developer' : null,
        pageUrl: samePagePath(event),
      })
    } catch {
      // El hilo de la bandeja es un extra: el mensaje y el lead ya están guardados.
    }
    // Un lead nuevo ya avisa por su cuenta («lead_created», server/utils/leads.ts):
    // desde la ficha no se manda además el aviso genérico de mensaje.
    if (!(form === 'property' && leadCreated)) {
      try {
        await sendInternalNotification(db, cfEnv(event), orgId, 'contact_message', { name, email, phone: body.phone, subject: body.subject, message, adminUrl: `${platformBaseUrl(event)}/admin/comunicaciones` }, getRequestId(event))
      } catch {
        // The message is already saved — a notification failure must never undo that.
      }
    }
  } else {
    try {
      await sendInternalNotification(db, cfEnv(event), orgId, 'complaint', { name, email, phone: body.phone, message, adminUrl: `${platformBaseUrl(event)}/admin/contact-messages` }, getRequestId(event))
    } catch {
      // The complaint is already saved — a notification failure must never undo that.
    }
  }

  return { ok: true }
})
