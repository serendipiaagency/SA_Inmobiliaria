import { and, desc, eq, or } from 'drizzle-orm'
import { schema, useDb } from '../../../utils/db'
import { requireOrgScope, requireSuperAdmin } from '../../../utils/auth'
import { getResource } from '../../../utils/adminResources'
import { authorizeRecord } from '../../../utils/tenantPolicy'
import { organizationOverview } from '../../../utils/organizations/lifecycle'
import { loadPropertySheet, propertyKindForResource } from '../../../utils/properties/extendedSheet'

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
    // Precio anterior, quién lo cambió y por qué (migración 0086). `changedBy`
    // sólo lo escribe el servidor con el usuario de la sesión que editó esta
    // ficha: un miembro de esta organización o un super_admin trabajando en
    // ella. El nombre se resuelve sólo para esos dos casos — nunca el de un
    // usuario de otra agencia.
    const ph = key === 'developer-properties' ? schema.priceHistory : schema.agentPropertyPriceHistory
    const parentCol = key === 'developer-properties' ? schema.priceHistory.developerPropertyId : schema.agentPropertyPriceHistory.propertyId
    const priceHistory = await db
      .select({ price: ph.price, previousPrice: ph.previousPrice, reason: ph.reason, recordedAt: ph.recordedAt, changedByName: schema.users.name })
      .from(ph)
      .leftJoin(schema.users, and(eq(schema.users.id, ph.changedBy), or(eq(schema.users.organizationId, orgId!), eq(schema.users.role, 'super_admin'))))
      .where(eq(parentCol, id))
      .orderBy(desc(ph.recordedAt), desc(ph.id))
      .limit(50)
    // Ficha ampliada (property_details / property_legal_economics): campos
    // planos más de la fila, así el editor los trata igual que el resto.
    const sheet = await loadPropertySheet(db, orgId!, propertyKindForResource(key)!, id)
    return { row: { ...row, ...sheet }, translations, priceHistory }
  }
  // Ficha de empresa (Sistemas > Empresas): resumen y usuarios reales de esa
  // organización, para las secciones Resumen y Usuarios del editor.
  if (key === 'organizations') {
    return { row, translations, overview: await organizationOverview(db, id) }
  }
  return { row, translations }
})
