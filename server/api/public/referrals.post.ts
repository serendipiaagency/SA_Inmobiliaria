import { eq } from 'drizzle-orm'
import { useDb, schema, now } from '../../utils/db'
import { upsertLead } from '../../utils/leads'
import { rateLimit } from '../../utils/rateLimit'

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

  await upsertLead(event, {
    organizationId: link.organizationId,
    name: body.name.trim(),
    email: body.email || null,
    phone: body.phone || null,
    source: 'referral',
    notes: `Referido por ${link.referrerName}`,
    scoreBump: 15,
  })

  return { ok: true, id: referral.id, referrerName: link.referrerName }
})
