import { desc, eq } from 'drizzle-orm'
import { schema, useDb } from '../../../utils/db'
import { requireOrgScope, requireSuperAdmin } from '../../../utils/auth'
import { getResource } from '../../../utils/adminResources'
import { authorizeRecord } from '../../../utils/tenantPolicy'

export default defineEventHandler(async (event) => {
  const { key, def } = getResource(event)
  let orgId: number | null = null
  if (def.superAdminOnly) {
    await requireSuperAdmin(event)
  } else {
    orgId = (await requireOrgScope(event, def.area, 'read')).orgId
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

  // FASE 28 §94 — el histórico de precios (PropertyPriceHistory) de cada
  // catálogo, que la edición manual y la acción en bloque ya escriben pero
  // ningún endpoint del panel leía. Va aquí, en la ficha que el editor ya
  // pide, y no en una ruta nueva (margen de claves de ruta = 0, ver
  // docs/property-schema-registry.md). La fila ya está autorizada arriba.
  if (key === 'developer-properties' || key === 'properties') {
    const priceHistory =
      key === 'developer-properties'
        ? await db
            .select({ price: schema.priceHistory.price, recordedAt: schema.priceHistory.recordedAt })
            .from(schema.priceHistory)
            .where(eq(schema.priceHistory.developerPropertyId, id))
            .orderBy(desc(schema.priceHistory.recordedAt), desc(schema.priceHistory.id))
            .limit(50)
        : await db
            .select({ price: schema.agentPropertyPriceHistory.price, recordedAt: schema.agentPropertyPriceHistory.recordedAt })
            .from(schema.agentPropertyPriceHistory)
            .where(eq(schema.agentPropertyPriceHistory.propertyId, id))
            .orderBy(desc(schema.agentPropertyPriceHistory.recordedAt), desc(schema.agentPropertyPriceHistory.id))
            .limit(50)
    return { row, translations, priceHistory }
  }
  return { row, translations }
})
