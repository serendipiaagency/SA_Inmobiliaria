import { and, eq } from 'drizzle-orm'
import { useDb } from '../../../utils/db'
import { requireOrgScope, requireSuperAdmin } from '../../../utils/auth'
import { getResource } from '../../../utils/adminResources'

export default defineEventHandler(async (event) => {
  const { def } = getResource(event)
  let orgId: number | null = null
  if (def.superAdminOnly) {
    await requireSuperAdmin(event)
  } else {
    orgId = (await requireOrgScope(event)).orgId
  }
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const db = useDb(event)

  const idCond = eq(def.table.id, id)
  const orgCond = def.orgScoped !== false && orgId != null ? eq(def.table.organizationId, orgId) : undefined
  const where = orgCond ? and(idCond, orgCond) : idCond

  const rows = await db.select().from(def.table).where(where as any).limit(1)
  const row = rows[0]
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  let translations: any[] = []
  if (def.translations) {
    const { table, foreignKey } = def.translations
    translations = await db.select().from(table).where(eq(table[foreignKey], id))
  }
  return { row, translations }
})
