import { and, desc, eq, or } from 'drizzle-orm'
import { cfEnv, schema, useDb } from '../../../utils/db'
import { requireOrgScope, requireSuperAdmin, type SessionUser } from '../../../utils/auth'
import { getResource } from '../../../utils/adminResources'
import { authorizeRecord } from '../../../utils/tenantPolicy'
import { organizationOverview } from '../../../utils/organizations/lifecycle'
import { loadPropertySheet, propertyKindForResource } from '../../../utils/properties/extendedSheet'
import { listContactRoles } from '../../../utils/contacts/crm'
import { getLeadDetail } from '../../../utils/leads/admin'
import { decorateDocumentRows } from '../../../utils/properties/documents'
import { buildPropertySummary } from '../../../utils/properties/summary'
import { assertCustomFieldValueScope } from '../../../utils/customFields/service'
import { assertTagLinkScope } from '../../../utils/tags/service'
import { automationDetail } from '../../../utils/automations/service'

export default defineEventHandler(async (event) => {
  const { key, def } = getResource(event)
  let orgId: number | null = null
  let user: SessionUser
  if (def.superAdminOnly) {
    user = await requireSuperAdmin(event)
  } else {
    ;({ user, orgId } = await requireOrgScope(event, def.area, 'read'))
  }
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const db = useDb(event)

  // Throws 404 both when the record doesn't exist and when it belongs to
  // another tenant — the two cases must stay indistinguishable, otherwise the
  // status code alone confirms which ids are real elsewhere on the platform.
  const { row } = await authorizeRecord(db, { resourceKey: key, table: def.table, policy: def.tenantPolicy, id, orgId })
  // Un valor o un enlace de etiqueta leído por el recurso del área que no le
  // corresponde (p. ej. el de una propiedad por el recurso de CRM): 404.
  assertCustomFieldValueScope(key, row)
  assertTagLinkScope(key, row)

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
    // Resumen de la ficha (FASE 25, bloque N7a): estado, precio, canales de
    // publicación, propietarios, compatibles, ofertas, documentos caducados,
    // multimedia y qué falta para publicar. `?view=summary` — sin ruta nueva.
    if (getQuery(event).view === 'summary') {
      return { summary: await buildPropertySummary(event, db, cfEnv(event) as Record<string, any>, orgId!, user, propertyKindForResource(key)!, row, sheet) }
    }
    return { row: { ...row, ...sheet }, translations, priceHistory }
  }
  // Ficha de empresa (Sistemas > Empresas): resumen y usuarios reales de esa
  // organización, para las secciones Resumen y Usuarios del editor.
  // Contacto: con sus roles (contact_roles), que no son columnas de la fila.
  if (key === 'contacts') {
    return { row: { ...row, roles: await listContactRoles(db, orgId!, id) }, translations }
  }
  // Ficha del lead: historial de etapas y de asignaciones, contacto, oficina, SLA, visitas y conversaciones.
  if (key === 'leads') return { ...(await getLeadDetail(event, orgId!, id)), translations }
  // Documento de una propiedad (FASE 6): con sus etiquetas, caducidad y los contactos con acceso concedido.
  if (key === 'property-documents') {
    const [decorated] = await decorateDocumentRows(db, orgId!, [row])
    return { row: decorated, translations }
  }
  // Automatización (bloque N8b): su configuración legible y su registro de ejecuciones.
  if (key === 'automations') return { ...(await automationDetail(db, orgId!, row)), translations }
  if (key === 'organizations') {
    return { row, translations, overview: await organizationOverview(db, id) }
  }
  return { row, translations }
})
