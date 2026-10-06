import { eq } from 'drizzle-orm'
import { useDb, schema, now } from '../../utils/db'
import { upsertLead } from '../../utils/leads'
import { rateLimit } from '../../utils/rateLimit'
import { readFirstTouch } from '../../utils/firstTouch'
import { recordWebFormSubmission } from '../../utils/comms/web'
import { samePagePath } from '../../utils/comms/webPublic'

interface Body {
  code?: string
  name?: string
  email?: string
  phone?: string
}

/** Captures a real referral submission — creates the referral record and a matching CRM lead (source: referral) in one write. */
export default defineEventHandler(async (event) => {
  await rateLimit(event, 'public-referral', { limit: 10, windowSeconds: 60 })
  const body = await readBody<Body>(event)
  if (!body?.code || !body?.name?.trim()) throw createError({ statusCode: 422, statusMessage: 'code and name are required' })
  if (!body.email && !body.phone) throw createError({ statusCode: 422, statusMessage: 'email or phone is required' })

  const db = useDb(event)
  const link = (await db.select().from(schema.referralLinks).where(eq(schema.referralLinks.code, body.code)).limit(1))[0]
  if (!link) throw createError({ statusCode: 404, statusMessage: 'Enlace de referido no encontrado' })

  const [referral] = await db
    .insert(schema.referrals)
    .values({
      organizationId: link.organizationId,
      referralLinkId: link.id,
      refereeName: body.name.trim().slice(0, 200),
      refereeEmail: body.email || null,
      refereePhone: body.phone || null,
      status: 'pending',
      createdAt: now(),
    })
    .returning()

  const lead = await upsertLead(event, {
    organizationId: link.organizationId,
    name: body.name.trim(),
    email: body.email || null,
    phone: body.phone || null,
    source: 'referral',
    sourceDetail: link.referrerName,
    notes: `Referido por ${link.referrerName}`,
    ...readFirstTouch(event),
  })

  // Núcleo N8a (FASE 29): el referido también es un hilo «Formulario web» de
  // la bandeja de la agencia del enlace (nunca de otra), con su lead y Contact.
  try {
    await recordWebFormSubmission(db, {
      orgId: link.organizationId,
      formType: 'referral',
      leadId: lead?.id ?? null,
      name: body.name.trim(),
      email: body.email || null,
      phone: body.phone || null,
      message: `Llega recomendado por ${link.referrerName} (enlace de referidos).`,
      fields: { referrer: link.referrerName },
      pageUrl: samePagePath(event),
    })
  } catch {
    // El referido y su lead ya están guardados: el hilo nunca los bloquea.
  }

  return { ok: true, id: referral.id, referrerName: link.referrerName }
})
