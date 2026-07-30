import { and, eq } from 'drizzle-orm'
import { useDb, schema, now } from '../../utils/db'
import { requireApiKey } from '../../utils/apiAuth'
import { rateLimit } from '../../utils/rateLimit'
import { isValidEmail, isValidPhone } from '../../utils/validate'

interface CreateLeadBody {
  name?: string
  email?: string
  phone?: string
  source?: string
  propertyId?: number
  budget?: number
  notes?: string
}

/**
 * POST /api/v1/leads — documented since before this existed (same gap as
 * /communities and /agents). Requires the "write" scope. Writes straight
 * into the same `leads` table the admin CRM reads, org-scoped to the
 * caller's API key — no fabricated confirmation, the returned id is real.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireApiKey(event, 'write')
  await rateLimit(event, 'public-api-write', { limit: 30, windowSeconds: 60 })

  const body = await readBody<CreateLeadBody>(event)
  const name = String(body?.name || '').trim()
  if (!name) throw createError({ statusCode: 422, statusMessage: 'name is required' })
  if (!body?.email && !body?.phone) throw createError({ statusCode: 422, statusMessage: 'email or phone is required' })
  if (body.email && !isValidEmail(body.email)) throw createError({ statusCode: 422, statusMessage: 'Invalid email' })
  if (body.phone && !isValidPhone(body.phone)) throw createError({ statusCode: 422, statusMessage: 'Invalid phone' })

  const db = useDb(event)
  let propertyName: string | null = null
  if (body.propertyId) {
    const rows = await db
      .select({ name: schema.developerProperties.name })
      .from(schema.developerProperties)
      .where(and(eq(schema.developerProperties.id, body.propertyId), eq(schema.developerProperties.organizationId, orgId)))
      .limit(1)
    if (!rows[0]) throw createError({ statusCode: 422, statusMessage: 'propertyId does not belong to this organization' })
    propertyName = rows[0].name
  }

  const nowTs = now()
  const [lead] = await db
    .insert(schema.leads)
    .values({
      organizationId: orgId,
      name: name.slice(0, 200),
      email: body.email?.trim() || null,
      phone: body.phone?.trim() || null,
      source: 'api',
      status: 'new',
      score: 10,
      budget: body.budget || null,
      propertyId: body.propertyId || null,
      propertyName,
      notes: body.notes?.slice(0, 2000) || null,
      lastContactAt: nowTs,
      createdAt: nowTs,
      updatedAt: nowTs,
    })
    .returning()

  return { data: lead }
})
