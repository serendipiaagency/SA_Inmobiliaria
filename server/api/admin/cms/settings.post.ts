import { eq } from 'drizzle-orm'
import { useDb, schema, now } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const body = await readBody<Record<string, any>>(event)

  const values = {
    organizationId: orgId,
    defaultLanguage: body?.defaultLanguage === 'en' ? 'en' : 'es',
    commentsEnabled: body?.commentsEnabled ? 1 : 0,
    commentsRequireApproval: body?.commentsRequireApproval ? 1 : 0,
    defaultAuthorId: body?.defaultAuthorId ? Number(body.defaultAuthorId) : null,
    updatedAt: now(),
  }

  const existing = await db.select({ organizationId: schema.cmsSettings.organizationId }).from(schema.cmsSettings).where(eq(schema.cmsSettings.organizationId, orgId)).limit(1)
  if (existing[0]) {
    await db.update(schema.cmsSettings).set(values).where(eq(schema.cmsSettings.organizationId, orgId))
  } else {
    await db.insert(schema.cmsSettings).values(values)
  }
  return { ok: true }
})
