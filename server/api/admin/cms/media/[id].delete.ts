import { and, eq } from 'drizzle-orm'
import { useDb, schema, cfEnv, now } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'

/** Soft-deletes by default (Papelera, recoverable). ?hard=1 purges the row AND the R2 object. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const hard = String(getQuery(event).hard || '') === '1'
  const db = useDb(event)
  const where = and(eq(schema.cmsMedia.id, id), eq(schema.cmsMedia.organizationId, orgId))

  const rows = await db.select({ url: schema.cmsMedia.url }).from(schema.cmsMedia).where(where).limit(1)
  const row = rows[0]
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  if (!hard) {
    await db.update(schema.cmsMedia).set({ deletedAt: now() }).where(where)
    return { ok: true }
  }

  // The DB row disappearing for real must mean the R2 object disappears too — same rule as
  // visitor-submission document cleanup elsewhere in the admin.
  const key = row.url.replace(/^\/api\/media\//, '')
  if (key) await cfEnv(event).MEDIA.delete(key)

  await db.delete(schema.cmsMedia).where(where)
  return { ok: true }
})
