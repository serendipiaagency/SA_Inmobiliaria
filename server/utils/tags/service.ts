import { and, asc, eq, sql, type SQL } from 'drizzle-orm'
import { createError, type H3Event } from 'h3'
import { schema, useDb, now, slugify, isUniqueConstraintError } from '../db'
import { assertOwnedRef, assertPropertyOwned } from '../contacts/crm'

/**
 * Mismo vocabulario que tasks.propertyKind/activities.propertyKind, más
 * 'lead' (migración 0081) y 'contact' (bloque N7b: los contactos se pueden
 * etiquetar). `tag_links.entity_type` es texto libre: no hace falta migración.
 */
export type TaggableEntityType = 'agent' | 'developer' | 'lead' | 'contact'
export const TAGGABLE_ENTITY_TYPES: readonly TaggableEntityType[] = ['agent', 'developer', 'lead', 'contact']

/**
 * Qué entidades etiqueta cada recurso del motor genérico. El área de permisos
 * la pone el recurso (`property-tags` → Portal Web, `crm-tags` → CRM), igual
 * que `property-bulk-jobs` / `lead-bulk-jobs` sobre la misma tabla de jobs.
 */
export const TAG_LINK_RESOURCES: Record<string, readonly TaggableEntityType[]> = {
  'property-tags': ['agent', 'developer'],
  'crm-tags': ['lead', 'contact'],
}

export function isTagLinkResource(key: string): boolean {
  return key in TAG_LINK_RESOURCES
}

/** Un enlace leído por id desde el recurso que no le corresponde se trata como inexistente (404). */
export function assertTagLinkScope(resourceKey: string, row: { entityType?: string | null }) {
  const allowed = TAG_LINK_RESOURCES[resourceKey]
  if (allowed && !allowed.includes(row.entityType as TaggableEntityType)) throw createError({ statusCode: 404, statusMessage: 'Not found' })
}

export interface TagDto {
  id: number
  name: string
  slug: string
  color: string | null
}

/** Máximo de etiquetas por filtro: cada una es una subconsulta. */
export const MAX_TAG_FILTERS = 10

/**
 * Tag transversal (FASE 28 §89, §99) — el primero que existe fuera del Blog
 * (cmsTags era su único precedente). "Get or create by name": el llamador
 * nunca resuelve un id de tag a mano, evita el caso donde dos peticiones
 * casi simultáneas crearan dos tags con el mismo nombre — `tags_org_slug` es
 * la guarda real, esta función sólo reintenta una vez si la pierde.
 */
export async function getOrCreateTag(event: H3Event, orgId: number, name: string): Promise<{ id: number; name: string; slug: string }> {
  return getOrCreateTagDb(useDb(event), orgId, name)
}

export async function getOrCreateTagDb(db: any, orgId: number, name: string): Promise<{ id: number; name: string; slug: string; color?: string | null }> {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) throw createError({ statusCode: 422, statusMessage: 'El nombre de la etiqueta no puede estar vacío' })
  if (trimmed.length > 60) throw createError({ statusCode: 422, statusMessage: 'Una etiqueta admite como máximo 60 caracteres' })
  const slug = slugify(trimmed)
  if (!slug) throw createError({ statusCode: 422, statusMessage: 'Nombre de etiqueta inválido' })

  const existing = (await db.select().from(schema.tags).where(and(eq(schema.tags.organizationId, orgId), eq(schema.tags.slug, slug))).limit(1))[0]
  if (existing) return existing

  try {
    const [created] = await db.insert(schema.tags).values({ organizationId: orgId, name: trimmed, slug, createdAt: now() }).returning()
    return created
  } catch (err) {
    if (!isUniqueConstraintError(err)) throw err
    // Perdió la carrera contra otra petición que creó el mismo slug entre el
    // SELECT y el INSERT de arriba — la fila ya existe, se lee y se usa.
    const raced = (await db.select().from(schema.tags).where(and(eq(schema.tags.organizationId, orgId), eq(schema.tags.slug, slug))).limit(1))[0]
    if (!raced) throw err
    return raced
  }
}

/**
 * Enlaza una etiqueta a una entidad — idempotente: volver a etiquetar algo
 * ya etiquetado no duplica el enlace (`tag_links_unique`), simplemente no
 * hace nada la segunda vez. Sin esto, reintentar una acción masiva sobre el
 * mismo lote (§105) crearía enlaces repetidos.
 */
export async function linkTag(event: H3Event, orgId: number, tagId: number, entityType: TaggableEntityType, entityId: number): Promise<void> {
  await linkTagDb(useDb(event), orgId, tagId, entityType, entityId)
}

async function linkTagDb(db: any, orgId: number, tagId: number, entityType: TaggableEntityType, entityId: number): Promise<void> {
  try {
    await db.insert(schema.tagLinks).values({ organizationId: orgId, tagId, entityType, entityId, createdAt: now() })
  } catch (err) {
    if (!isUniqueConstraintError(err)) throw err
  }
}

/** La entidad que se etiqueta existe y es de esta agencia (404 si no). */
export async function assertTaggableEntity(db: any, orgId: number, entityType: TaggableEntityType, entityId: number): Promise<void> {
  if (!Number.isInteger(entityId) || entityId <= 0) throw createError({ statusCode: 422, statusMessage: 'Falta qué registro etiquetar' })
  if (entityType === 'agent' || entityType === 'developer') return assertPropertyOwned(db, orgId, entityType, entityId)
  if (entityType === 'lead') return assertOwnedRef(db, schema.leads, entityId, orgId, 'Lead')
  return assertOwnedRef(db, schema.contacts, entityId, orgId, 'Contacto')
}

function assertEntityType(v: unknown, allowed: readonly TaggableEntityType[]): TaggableEntityType {
  if (!(TAGGABLE_ENTITY_TYPES as readonly string[]).includes(String(v))) throw createError({ statusCode: 422, statusMessage: 'Tipo de registro no válido para una etiqueta' })
  // El recurso equivocado para esta entidad (p. ej. etiquetar un lead por el recurso de propiedades): como si no existiera.
  if (!allowed.includes(v as TaggableEntityType)) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return v as TaggableEntityType
}

export function listTagsForEntity(event: H3Event, orgId: number, entityType: TaggableEntityType, entityId: number) {
  return listEntityTags(useDb(event), orgId, entityType, entityId)
}

/** Las etiquetas de una entidad, con el id del enlace (para poder quitarla). */
export async function listEntityTags(db: any, orgId: number, entityType: TaggableEntityType, entityId: number) {
  return db
    // `link_id` con alias: dos columnas `id` en la misma fila (tags y tag_links) se pisan en algunos drivers.
    .select({ id: schema.tags.id, linkId: sql<number>`${schema.tagLinks.id}`.as('link_id'), name: schema.tags.name, slug: schema.tags.slug, color: schema.tags.color })
    .from(schema.tagLinks)
    .innerJoin(schema.tags, and(eq(schema.tagLinks.tagId, schema.tags.id), eq(schema.tags.organizationId, orgId)))
    .where(and(eq(schema.tagLinks.organizationId, orgId), eq(schema.tagLinks.entityType, entityType), eq(schema.tagLinks.entityId, entityId)))
    .orderBy(asc(schema.tags.name))
}

/**
 * Las etiquetas de muchas entidades a la vez (filas de un listado), en UNA
 * consulta: los ids viajan como un único parámetro JSON, así una página de
 * 200 filas nunca choca con el límite de 100 parámetros de D1.
 */
export async function tagsByEntity(db: any, orgId: number, entityType: TaggableEntityType, entityIds: number[]): Promise<Map<number, TagDto[]>> {
  const out = new Map<number, TagDto[]>()
  const ids = [...new Set(entityIds.filter((n) => Number.isInteger(n) && n > 0))]
  if (!ids.length) return out
  const rows = await db
    .select({ entityId: schema.tagLinks.entityId, id: schema.tags.id, name: schema.tags.name, slug: schema.tags.slug, color: schema.tags.color })
    .from(schema.tagLinks)
    .innerJoin(schema.tags, and(eq(schema.tagLinks.tagId, schema.tags.id), eq(schema.tags.organizationId, orgId)))
    .where(and(eq(schema.tagLinks.organizationId, orgId), eq(schema.tagLinks.entityType, entityType), sql`${schema.tagLinks.entityId} in (select value from json_each(${JSON.stringify(ids)}))`))
    .orderBy(asc(schema.tags.name))
  for (const r of rows) {
    const list = out.get(r.entityId) || []
    list.push({ id: r.id, name: r.name, slug: r.slug, color: r.color ?? null })
    out.set(r.entityId, list)
  }
  return out
}

/** Añade `tags: TagDto[]` a cada fila de un listado ya acotado por organización. */
export async function withTags<T extends { id: number }>(db: any, orgId: number, entityType: TaggableEntityType, rows: T[]): Promise<(T & { tags: TagDto[] })[]> {
  const map = await tagsByEntity(db, orgId, entityType, rows.map((r) => r.id))
  return rows.map((r) => ({ ...r, tags: map.get(r.id) || [] }))
}

/** El catálogo de etiquetas de la agencia, con cuántas veces se usa cada una en esos tipos de registro. */
export async function listOrgTags(db: any, orgId: number, entityTypes: readonly TaggableEntityType[] = TAGGABLE_ENTITY_TYPES) {
  const rows = await db
    .select({
      id: schema.tags.id,
      name: schema.tags.name,
      slug: schema.tags.slug,
      color: schema.tags.color,
      // Columna escrita con su tabla: dentro del SELECT de una sola tabla Drizzle
      // la pondría sin calificar, y `"id"` se resolvería contra tag_links.
      uses: sql<number>`(select count(*) from tag_links l where l.tag_id = "tags"."id" and l.organization_id = ${orgId} and l.entity_type in (select value from json_each(${JSON.stringify(entityTypes)})))`,
    })
    .from(schema.tags)
    .where(eq(schema.tags.organizationId, orgId))
    .orderBy(asc(schema.tags.name))
  return rows.map((r: any) => ({ ...r, uses: Number(r.uses) || 0 }))
}

/**
 * Etiquetar a mano desde una ficha: por nombre (se crea si no existe) o por
 * el id de una etiqueta de la agencia (404 si es de otra). La entidad se
 * comprueba primero. Idempotente.
 */
export async function addTagToEntity(db: any, orgId: number, allowed: readonly TaggableEntityType[], body: Record<string, unknown>) {
  const entityType = assertEntityType(body.entityType, allowed)
  const entityId = Number(body.entityId)
  await assertTaggableEntity(db, orgId, entityType, entityId)
  let tag: { id: number; name: string; slug: string; color?: string | null }
  if (body.tagId != null && body.tagId !== '') {
    const tagId = Number(body.tagId)
    const [row] = await db.select().from(schema.tags).where(and(eq(schema.tags.id, tagId), eq(schema.tags.organizationId, orgId))).limit(1)
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Etiqueta no encontrada' })
    tag = row
  } else {
    tag = await getOrCreateTagDb(db, orgId, String(body.name ?? ''))
  }
  await linkTagDb(db, orgId, tag.id, entityType, entityId)
  return { tag: { id: tag.id, name: tag.name, slug: tag.slug, color: tag.color ?? null }, tags: await listEntityTags(db, orgId, entityType, entityId) }
}

/** GET de `property-tags` / `crm-tags`: las de un registro, o el catálogo de la agencia si no se pide ninguno. */
export async function tagLinksResourceGet(db: any, orgId: number, resourceKey: string, query: Record<string, unknown>) {
  const allowed = TAG_LINK_RESOURCES[resourceKey]!
  if (query.entityType != null && query.entityType !== '') {
    const entityType = assertEntityType(query.entityType, allowed)
    const entityId = Number(query.entityId)
    await assertTaggableEntity(db, orgId, entityType, entityId)
    return { rows: await listEntityTags(db, orgId, entityType, entityId) }
  }
  return { rows: await listOrgTags(db, orgId, allowed), catalog: true }
}

/** Al borrar definitivamente una propiedad, sus enlaces de etiqueta se van con ella. */
export async function deleteEntityTagLinks(db: any, orgId: number, entityType: TaggableEntityType, entityId: number) {
  await db.delete(schema.tagLinks).where(and(eq(schema.tagLinks.organizationId, orgId), eq(schema.tagLinks.entityType, entityType), eq(schema.tagLinks.entityId, entityId)))
}

/**
 * Filtro «tiene estas etiquetas» (todas) para cualquier listado: una
 * subconsulta por etiqueta, correlacionada con el id y la organización de la
 * fila. Una etiqueta de otra agencia no coincide con nada.
 */
export function tagFilterConds(entityType: TaggableEntityType, idCol: any, orgCol: any, tagIds: number[]): SQL[] {
  return tagIds.map(
    (tagId) => sql`exists (select 1 from tag_links tl where tl.organization_id = ${orgCol} and tl.entity_type = ${entityType} and tl.entity_id = ${idCol} and tl.tag_id = ${tagId})`,
  )
}

/** `tags=3,7` (o `tagId=3`) de una query string → ids válidos, como mucho MAX_TAG_FILTERS. */
export function parseTagIds(raw: unknown): number[] {
  if (raw == null || raw === '') return []
  const list = (Array.isArray(raw) ? raw.join(',') : String(raw))
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
  const unique = [...new Set(list)]
  if (unique.length > MAX_TAG_FILTERS) throw createError({ statusCode: 422, statusMessage: `Como máximo ${MAX_TAG_FILTERS} etiquetas por filtro` })
  return unique
}
