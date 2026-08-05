import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../utils/auth'
import { useDb, schema, now } from '../../../../../utils/db'
import { logAdminAction } from '../../../../../utils/audit'

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const contract = (await db.select().from(schema.contracts).where(eq(schema.contracts.id, id)).limit(1))[0]
  if (!contract || contract.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Contract not found' })
  if (contract.status === 'accepted') throw createError({ statusCode: 409, statusMessage: 'No se puede anular un contrato ya aceptado' })

  await db.update(schema.contracts).set({ status: 'void', updatedAt: now() }).where(eq(schema.contracts.id, id))
  await logAdminAction(event, { user, orgId, action: 'update', resource: 'contract', resourceId: id })
  return { ok: true }
})
