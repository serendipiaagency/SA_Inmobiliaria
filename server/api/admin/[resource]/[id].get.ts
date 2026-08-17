import { eq } from 'drizzle-orm'
import { useDb } from '../../../utils/db'
import { requireOrgScope, requireSuperAdmin } from '../../../utils/auth'
import { getResource } from '../../../utils/adminResources'
import { authorizeRecord } from '../../../utils/tenantPolicy'

export default defineEventHandler(async (event) => {
  const { key, def } = getResource(event)
  let orgId: number | null = null
  if (def.superAdminOnly) {
    await requireSuperAdmin(event)
  } else {
    orgId = (await requireOrgScope(event)).orgId
  }
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const db = useDb(event)

  // Throws 404 both when the record doesn't exist and when it belongs to
  // another tenant — the two cases must stay indistinguishable, otherwise the
  // status code alone confirms which ids are real elsewhere on the platform.
  const { row } = await authorizeRecord(db, { resourceKey: key, table: def.table, policy: def.tenantPolicy, id, orgId })

  let translations: any[] = []
  if (def.translations) {
    const { table, foreignKey } = def.translations
    translations = await db.select().from(table).where(eq(table[foreignKey], id))
  }
  return { row, translations }
})
