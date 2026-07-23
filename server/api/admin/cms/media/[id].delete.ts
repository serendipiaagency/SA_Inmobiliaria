import { and, eq } from 'drizzle-orm'
import { useDb, schema, cfEnv } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const db = useDb(event)
  const where = and(eq(schema.cmsMedia.id, id), eq(schema.cmsMedia.organizationId, orgId))

  const rows = await db.select({ url: schema.cmsMedia.url }).from(schema.cmsMedia).where(where).limit(1)
  const row = rows[0]
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  // The DB row disappearing must mean the R2 object disappears too — same rule as
  // visitor-submission document cleanup elsewhere in the admin.
  const key = row.url.replace(/^\/api\/media\//, '')
  if (key) await cfEnv(event).MEDIA.delete(key)

  await db.delete(schema.cmsMedia).where(where)
  return { ok: true }
})
