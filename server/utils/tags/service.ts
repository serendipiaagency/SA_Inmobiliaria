import { and, eq } from 'drizzle-orm'
import { createError, type H3Event } from 'h3'
import { schema, useDb, now, slugify, isUniqueConstraintError } from '../db'

/** Mismo vocabulario que tasks.propertyKind/activities.propertyKind, más 'lead' — ver migración 0081. */
export type TaggableEntityType = 'agent' | 'developer' | 'lead'

/**
 * Tag transversal (FASE 28 §89, §99) — el primero que existe fuera del Blog
 * (cmsTags era su único precedente). "Get or create by name": el llamador
 * nunca resuelve un id de tag a mano, evita el caso donde dos peticiones
 * casi simultáneas crearan dos tags con el mismo nombre — `tags_org_slug` es
 * la guarda real, esta función sólo reintenta una vez si la pierde.
 */
export async function getOrCreateTag(event: H3Event, orgId: number, name: string): Promise<{ id: number; name: string; slug: string }> {
  const db = useDb(event)
  const trimmed = name.trim()
  if (!trimmed) throw createError({ statusCode: 422, statusMessage: 'El nombre de la etiqueta no puede estar vacío' })
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
  const db = useDb(event)
  try {
    await db.insert(schema.tagLinks).values({ organizationId: orgId, tagId, entityType, entityId, createdAt: now() })
  } catch (err) {
    if (!isUniqueConstraintError(err)) throw err
  }
}

export async function listTagsForEntity(event: H3Event, orgId: number, entityType: TaggableEntityType, entityId: number) {
  const db = useDb(event)
  return db
    .select({ id: schema.tags.id, name: schema.tags.name, slug: schema.tags.slug, color: schema.tags.color })
    .from(schema.tagLinks)
    .innerJoin(schema.tags, eq(schema.tagLinks.tagId, schema.tags.id))
    .where(and(eq(schema.tagLinks.organizationId, orgId), eq(schema.tagLinks.entityType, entityType), eq(schema.tagLinks.entityId, entityId)))
}
