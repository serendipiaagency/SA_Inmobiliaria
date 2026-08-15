import { and, eq, sql } from 'drizzle-orm'
import { useDb, schema, cfEnv, now } from '../../../utils/db'
import { requireOrgScope, requireSuperAdmin, type SessionUser } from '../../../utils/auth'
import { getResource } from '../../../utils/adminResources'
import { logAdminAction } from '../../../utils/audit'
import { authorizeRecord, buildTenantWhere } from '../../../utils/tenantPolicy'

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

  // Ownership first: a delete against another tenant's id must 404 before it
  // touches R2 or any counter, not merely match zero rows on the way out.
  const { row } = await authorizeRecord(db, { resourceKey: key, table: def.table, policy: def.tenantPolicy, id, orgId })

  const tenantWhere = buildTenantWhere(db, def.table, def.tenantPolicy, orgId)
  const idCond = eq(def.table.id, id)
  const where = tenantWhere ? and(idCond, tenantWhere) : idCond

  if (key === 'visitor-submissions') {
    const record = row as Record<string, string | null>
    const keys = VISITOR_DOC_FIELDS.map((f) => record[f]).filter((v): v is string => !!v)
    if (keys.length) {
      const bucket = cfEnv(event).MEDIA
      await Promise.all(keys.map((k) => bucket.delete(k)))
    }
  }

  if (key === 'cms-comments' && row.status === 'approved') {
    await db
      .update(schema.cmsArticles)
      .set({ commentCount: sql`max(${schema.cmsArticles.commentCount} - 1, 0)` })
      .where(and(eq(schema.cmsArticles.id, row.articleId), eq(schema.cmsArticles.organizationId, orgId!)))
  }

  // Soft-delete resources move to Papelera by default; ?hard=1 (used from
  // within Papelera itself) purges the row for real.
  const hard = String(getQuery(event).hard || '') === '1'
  try {
    if (def.softDelete && !hard) {
      await db.update(def.table).set({ deletedAt: now() }).where(where as any)
    } else {
      await db.delete(def.table).where(where as any)
    }
  } catch (err: any) {
    // A hard delete can hit a real FK reference (e.g. a category still used by an
    // article). Surface that as an honest, actionable error instead of a raw 500.
    const msg = String(err?.cause?.message || err?.message || '')
    if (msg.includes('FOREIGN KEY constraint failed')) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Este registro todavía está en uso por otros datos (por ejemplo, artículos u otros elementos que lo referencian). Reasígnalos o elimínalos primero.',
      })
    }
    throw err
  }
  await logAdminAction(event, { user, orgId, action: 'delete', resource: key, resourceId: id, detail: hard ? 'hard' : 'soft' })
  return { ok: true }
})
