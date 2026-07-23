import { and, eq } from 'drizzle-orm'
import { useDb, schema } from '../../../../../utils/db'
import { requireOrgScope } from '../../../../../utils/auth'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const db = useDb(event)
  await db
    .update(schema.cmsMedia)
    .set({ deletedAt: null })
    .where(and(eq(schema.cmsMedia.id, id), eq(schema.cmsMedia.organizationId, orgId)))
  return { ok: true }
})
