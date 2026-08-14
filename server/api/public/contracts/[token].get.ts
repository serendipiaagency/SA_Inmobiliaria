import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { rateLimit } from '../../../utils/rateLimit'

/** Self-service lookup: the management token itself is the auth, no session needed — same pattern as appointments. */
export default defineEventHandler(async (event) => {
  await rateLimit(event, 'contract-manage', { limit: 30, windowSeconds: 60 })

  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Missing token' })

  const db = useDb(event)
  const contract = (await db.select().from(schema.contracts).where(eq(schema.contracts.managementToken, token)).limit(1))[0]
  if (!contract) throw createError({ statusCode: 404, statusMessage: 'Contrato no encontrado' })

  const org = (await db.select({ name: schema.organizations.name }).from(schema.organizations).where(eq(schema.organizations.id, contract.organizationId)).limit(1))[0]

  return {
    id: contract.id,
    title: contract.title,
    bodyText: contract.bodyText,
    clientName: contract.clientName,
    status: contract.status,
    acceptedByName: contract.acceptedByName,
    acceptedAt: contract.acceptedAt,
    orgName: org?.name || null,
  }
})
