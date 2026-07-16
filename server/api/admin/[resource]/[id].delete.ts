import { eq } from 'drizzle-orm'
import { useDb, schema, cfEnv } from '../../../utils/db'
import { requireAdmin } from '../../../utils/auth'
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
  const user = await requireAdmin(event)
  const { key, def } = getResource(event)
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  if (key === 'users' && id === user.id) {
    throw createError({ statusCode: 422, statusMessage: 'You cannot delete your own account' })
  }
  const db = useDb(event)

  if (key === 'visitor-submissions') {
    const rows = await db.select().from(schema.visitorSubmissions).where(eq(schema.visitorSubmissions.id, id)).limit(1)
    const row = rows[0] as Record<string, string | null> | undefined
    const keys = row ? VISITOR_DOC_FIELDS.map((f) => row[f]).filter((v): v is string => !!v) : []
    if (keys.length) {
      const bucket = cfEnv(event).MEDIA
      await Promise.all(keys.map((k) => bucket.delete(k)))
    }
  }

  await db.delete(def.table).where(eq(def.table.id, id))
  return { ok: true }
})
