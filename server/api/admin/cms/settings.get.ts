import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const db = useDb(event)
  const rows = await db.select().from(schema.cmsSettings).where(eq(schema.cmsSettings.organizationId, orgId)).limit(1)
  return (
    rows[0] || {
      organizationId: orgId,
      defaultLanguage: 'es',
      commentsEnabled: 1,
      commentsRequireApproval: 1,
      defaultAuthorId: null,
    }
  )
})
