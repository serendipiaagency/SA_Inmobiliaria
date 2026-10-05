import { and, eq, like, or } from 'drizzle-orm'
import { createError, type H3Event } from 'h3'
import { schema, useDb, now } from '../db'
import { tablesFor, type PropertyKind } from '../matching/service'
import { buildPropertyFilterConds, parsePropertyFilters } from '../properties/searchService'
import { assertSchemaValid } from '../properties/publication'
import { fireAutomationRules } from '../publication/automations'
import { adminResources } from '../adminResources'
import type { BulkActionItemHandler } from './service'
import { MAX_BULK_ACTION_TARGETS } from './service'
import { getOrCreateTag, linkTag } from '../tags/service'
import { livePropertyCond, trashedPropertyMessage } from '../properties/trash'

function propertyTable(kind: PropertyKind) {
  return tablesFor(kind).property as any
}

/**
 * Resuelve "seleccionar todos los resultados filtrados" (§84) del lado del
 * servidor con el MISMO filtro que ya usa el listado (searchService.ts,
 * FASE 27) — nunca una segunda forma de interpretar los mismos parámetros,
 * y nunca hace falta mandar miles de ids desde el navegador. Los campos de
 * texto libre son los que ya declara el recurso admin correspondiente
 * (adminResources.ts) — no se duplica esa lista aquí.
 */
export async function resolveFilteredPropertyIds(event: H3Event, orgId: number, kind: PropertyKind, filters: Record<string, unknown>): Promise<number[]> {
  const db = useDb(event)
  const t = propertyTable(kind)
  // «Todos los filtrados» son los del listado normal: nunca los de la papelera.
  const conds = [eq(t.organizationId, orgId), livePropertyCond(t), ...buildPropertyFilterConds(kind, parsePropertyFilters(filters))]

  const q = typeof filters.q === 'string' ? filters.q.trim() : ''
  if (q) {
    const resourceKey = kind === 'agent' ? 'properties' : 'developer-properties'
    const searchFields = adminResources[resourceKey].searchFields
    conds.push(or(...searchFields.map((f) => like(t[f], `%${q}%`)))!)
  }

  const rows = await db
    .select({ id: t.id })
    .from(t)
    .where(and(...conds))
    .limit(MAX_BULK_ACTION_TARGETS + 1)
  return rows.map((r: any) => r.id)
}

/**
 * Cada handler recibe el id ya reclamado, y primero confirma que la propiedad
 * sigue existiendo, sigue siendo de esta organización y no está en la
 * papelera — una fila pudo borrarse entre seleccionarla y procesarla. Ese
 * elemento falla con su motivo; el resto del lote sigue.
 */
async function assertOwnedProperty(event: H3Event, orgId: number, kind: PropertyKind, propertyId: number) {
  const db = useDb(event)
  const t = propertyTable(kind)
  const row = (await db.select().from(t).where(and(eq(t.id, propertyId), eq(t.organizationId, orgId))).limit(1))[0]
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Propiedad no encontrada' })
  if (row.deletedAt) throw createError({ statusCode: 422, statusMessage: trashedPropertyMessage('aplicarle una acción masiva') })
  return row
}

/** §87 — reutiliza la relación real (agentId), nunca un campo de texto libre. */
async function changeCommercial(event: H3Event, orgId: number, kind: PropertyKind, propertyId: number, params: { commercialId?: number | null }) {
  await assertOwnedProperty(event, orgId, kind, propertyId)
  const db = useDb(event)
  if (params.commercialId != null) {
    const agent = (
      await db.select({ id: schema.teamMembers.id }).from(schema.teamMembers).where(and(eq(schema.teamMembers.id, params.commercialId), eq(schema.teamMembers.organizationId, orgId))).limit(1)
    )[0]
    if (!agent) throw createError({ statusCode: 422, statusMessage: 'Comercial no encontrado' })
  }
  const t = propertyTable(kind)
  await db.update(t).set({ agentId: params.commercialId ?? null, updatedAt: now() }).where(eq(t.id, propertyId))
}

const AGENT_STATUSES = ['available', 'sold']
const DEVELOPER_STATUSES = ['new', 'under_construction', 'ready']

/** §88 — mismos valores de estado que ya usa el CRUD normal (server/utils/adminResources.ts): nunca un valor inventado que el resto del panel no entienda. */
async function changeStatus(event: H3Event, orgId: number, kind: PropertyKind, propertyId: number, params: { status?: string }) {
  const valid = kind === 'agent' ? AGENT_STATUSES : DEVELOPER_STATUSES
  if (!params.status || !valid.includes(params.status)) throw createError({ statusCode: 422, statusMessage: `Estado inválido para este catálogo: ${params.status}` })
  await assertOwnedProperty(event, orgId, kind, propertyId)
  const db = useDb(event)
  const t = propertyTable(kind)
  await db.update(t).set({ status: params.status, updatedAt: now() }).where(eq(t.id, propertyId))
}

/** §89 — Tag transversal (server/utils/tags/service.ts), nunca un "BulkTag" aparte. */
async function addTag(event: H3Event, orgId: number, kind: PropertyKind, propertyId: number, params: { tagName?: string }) {
  if (!params.tagName?.trim()) throw createError({ statusCode: 422, statusMessage: 'Falta el nombre de la etiqueta' })
  await assertOwnedProperty(event, orgId, kind, propertyId)
  const tag = await getOrCreateTag(event, orgId, params.tagName)
  await linkTag(event, orgId, tag.id, kind, propertyId)
}

/**
 * §90 — publicar en los dos catálogos: marca `publishedAt` (lo que filtra
 * «Publicadas» en el listado y lo que leen la publicación multicanal y los
 * portales). Reutiliza la MISMA validación de PropertySchemaRegistry que
 * dispara una edición manual (server/utils/properties/publication.ts) —
 * nunca una tercera interpretación de requiredForPublish — con el schema que
 * corresponde al catálogo y al tipo. Idempotente: publicar una propiedad ya
 * publicada es un éxito silencioso, no un error.
 */
async function publishProperty(event: H3Event, orgId: number, kind: PropertyKind, propertyId: number) {
  const row = await assertOwnedProperty(event, orgId, kind, propertyId)
  if (row.publishedAt) return
  assertSchemaValid(kind, row.propertyType, row, 'publish')
  const db = useDb(event)
  const t = propertyTable(kind)
  await db.update(t).set({ publishedAt: now(), updatedAt: now() }).where(eq(t.id, propertyId))
}

/**
 * §91 — "retirar" no existía como concepto antes de este incremento: limpia
 * `publishedAt`, nunca borra la fila (megaprompt: "nunca delete"). Idempotente
 * sobre una propiedad ya retirada.
 */
async function withdrawProperty(event: H3Event, orgId: number, kind: PropertyKind, propertyId: number) {
  const row = await assertOwnedProperty(event, orgId, kind, propertyId)
  if (!row.publishedAt) return
  const db = useDb(event)
  const t = propertyTable(kind)
  await db.update(t).set({ publishedAt: null, updatedAt: now() }).where(eq(t.id, propertyId))
}

/**
 * §94-95 — genera SIEMPRE un PropertyPriceHistory por fila, nunca se salta
 * (mismo criterio que ya aplica una edición manual en `[id].put.ts` para
 * developer-properties). `agent_property_price_history` (migración 0081)
 * escribe aquí por primera vez desde que la tabla existe.
 */
async function updatePrice(
  event: H3Event,
  orgId: number,
  kind: PropertyKind,
  propertyId: number,
  params: { price?: number; percent?: number; reason?: string },
  requestedBy?: number | null,
) {
  const row = await assertOwnedProperty(event, orgId, kind, propertyId)
  // Dos modos: un precio fijo para toda la selección, o un porcentaje sobre
  // el precio actual de cada una (+3 sube un 3 %, -5 baja un 5 %).
  let price: number
  if (params.percent !== undefined && params.percent !== null && String(params.percent) !== '') {
    const pct = Number(params.percent)
    if (!Number.isFinite(pct) || pct === 0 || pct < -90 || pct > 500) throw createError({ statusCode: 422, statusMessage: 'Porcentaje inválido (entre -90 y 500, distinto de 0)' })
    if (typeof row.price !== 'number' || row.price <= 0) throw createError({ statusCode: 422, statusMessage: 'La propiedad no tiene precio sobre el que aplicar el porcentaje' })
    price = Math.round(row.price * (1 + pct / 100))
  } else {
    price = Number(params.price)
    if (!Number.isFinite(price) || price <= 0) throw createError({ statusCode: 422, statusMessage: 'Precio inválido' })
  }
  if (row.price === price) return
  const reason = (typeof params.reason === 'string' && params.reason.trim().slice(0, 500)) || (params.percent ? `Acción masiva: ${Number(params.percent) > 0 ? '+' : ''}${params.percent} %` : 'Acción masiva')
  const db = useDb(event)
  const t = propertyTable(kind)
  const nowTs = now()
  await db.update(t).set({ price, updatedAt: nowTs }).where(eq(t.id, propertyId))
  const history = { price, previousPrice: row.price ?? null, changedBy: requestedBy ?? null, reason, recordedAt: nowTs }
  if (kind === 'developer') {
    await db.insert(schema.priceHistory).values({ developerPropertyId: propertyId, ...history })
    if (typeof row.price === 'number' && price < row.price) {
      await fireAutomationRules(db, orgId, propertyId, 'price_drop', `precio ${row.price} → ${price}`)
    }
  } else {
    await db.insert(schema.agentPropertyPriceHistory).values({ propertyId, ...history })
  }
}

/** Un mapa por catálogo — el mismo nombre de acción ('change_commercial', …) resuelve a la tabla correcta según qué job (agent/developer) lo está corriendo. */
export function propertyBulkHandlers(kind: PropertyKind): Record<string, BulkActionItemHandler> {
  return {
    change_commercial: (event, orgId, id, params) => changeCommercial(event, orgId, kind, id, params),
    change_status: (event, orgId, id, params) => changeStatus(event, orgId, kind, id, params),
    add_tag: (event, orgId, id, params) => addTag(event, orgId, kind, id, params),
    publish: (event, orgId, id) => publishProperty(event, orgId, kind, id),
    withdraw: (event, orgId, id) => withdrawProperty(event, orgId, kind, id),
    update_price: (event, orgId, id, params, requestedBy) => updatePrice(event, orgId, kind, id, params, requestedBy),
  }
}
