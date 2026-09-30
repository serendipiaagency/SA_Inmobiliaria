import { and, eq, like, or } from 'drizzle-orm'
import { createError, type H3Event } from 'h3'
import { schema, useDb, now } from '../db'
import { tablesFor, type PropertyKind } from '../matching/service'
import { buildPropertyFilterConds, parsePropertyFilters } from '../properties/searchService'
import { adminResources } from '../adminResources'
import type { BulkActionItemHandler } from './service'
import { MAX_BULK_ACTION_TARGETS } from './service'
import { getOrCreateTag, linkTag } from '../tags/service'

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
  const conds = [eq(t.organizationId, orgId), ...buildPropertyFilterConds(kind, parsePropertyFilters(filters))]

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

/** Cada handler recibe el id ya reclamado, y primero confirma que la propiedad sigue existiendo y sigue siendo de esta organización — una fila pudo borrarse entre seleccionarla y procesarla. */
async function assertOwnedProperty(event: H3Event, orgId: number, kind: PropertyKind, propertyId: number) {
  const db = useDb(event)
  const t = propertyTable(kind)
  const row = (await db.select().from(t).where(and(eq(t.id, propertyId), eq(t.organizationId, orgId))).limit(1))[0]
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Propiedad no encontrada' })
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

/** Un mapa por catálogo — el mismo nombre de acción ('change_commercial', …) resuelve a la tabla correcta según qué job (agent/developer) lo está corriendo. */
export function propertyBulkHandlers(kind: PropertyKind): Record<string, BulkActionItemHandler> {
  return {
    change_commercial: (event, orgId, id, params) => changeCommercial(event, orgId, kind, id, params),
    change_status: (event, orgId, id, params) => changeStatus(event, orgId, kind, id, params),
    add_tag: (event, orgId, id, params) => addTag(event, orgId, kind, id, params),
  }
}
