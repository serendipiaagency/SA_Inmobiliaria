import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../utils/db'
import { requireSuperAdmin } from '../../utils/auth'

/** Lets the super_admin switch which organization's data the admin panel shows. */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const body = await readBody<{ orgId?: number }>(event)
  const orgId = Number(body?.orgId)
  if (!Number.isInteger(orgId) || orgId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid orgId' })
  }
  const db = useDb(event)
  const rows = await db.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.id, orgId)).limit(1)
  if (!rows[0]) throw createError({ statusCode: 404, statusMessage: 'Organization not found' })

  setCookie(event, 'sa_active_org', String(orgId), {
    httpOnly: false, // read by the org-switcher UI to show the current selection
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  return { ok: true, orgId }
})
