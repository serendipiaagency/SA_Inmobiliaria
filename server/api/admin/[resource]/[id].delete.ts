import { and, eq, sql } from 'drizzle-orm'
import { useDb, schema, cfEnv } from '../../../utils/db'
import { requireOrgScope, requireSuperAdmin, type SessionUser } from '../../../utils/auth'
import { getResource } from '../../../utils/adminResources'

// visitor_submissions rows reference R2 keys for identity/financial PDFs. The DB row being
// gone must mean the documents are gone too — otherwise "deleting" someone's passport scan
// from the admin only hides it from the UI while it lingers in R2 indefinitely.
const VISITOR_DOC_FIELDS = [
  'passportPdf',
  'emiratesIdPdf',
  'bankStatementPdf',
  'tradeLicensePdf',
  'vatRegistrationCertificatePdf',
  'etihadCreditBureauPdf',
] as const

export default defineEventHandler(async (event) => {
  const { key, def } = getResource(event)
  let orgId: number | null = null
  let user: SessionUser
  if (def.superAdminOnly) {
    user = await requireSuperAdmin(event)
  } else {
    ;({ user, orgId } = await requireOrgScope(event))
  }
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  if (key === 'users' && id === user.id) {
    throw createError({ statusCode: 422, statusMessage: 'You cannot delete your own account' })
  }
  const db = useDb(event)

  const idCond = eq(def.table.id, id)
  const orgCond = def.orgScoped !== false && orgId != null ? eq(def.table.organizationId, orgId) : undefined
  const where = orgCond ? and(idCond, orgCond) : idCond

  if (key === 'visitor-submissions') {
    const rows = await db.select().from(schema.visitorSubmissions).where(where as any).limit(1)
    const row = rows[0] as Record<string, string | null> | undefined
    const keys = row ? VISITOR_DOC_FIELDS.map((f) => row[f]).filter((v): v is string => !!v) : []
    if (keys.length) {
      const bucket = cfEnv(event).MEDIA
      await Promise.all(keys.map((k) => bucket.delete(k)))
    }
  }

  if (key === 'cms-comments') {
    const rows = await db.select({ status: schema.cmsComments.status, articleId: schema.cmsComments.articleId }).from(schema.cmsComments).where(where as any).limit(1)
    if (rows[0]?.status === 'approved') {
      await db.update(schema.cmsArticles).set({ commentCount: sql`max(${schema.cmsArticles.commentCount} - 1, 0)` }).where(eq(schema.cmsArticles.id, rows[0].articleId))
    }
  }

  await db.delete(def.table).where(where as any)
  return { ok: true }
})
