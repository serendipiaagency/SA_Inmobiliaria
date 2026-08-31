import { and, eq, sql } from 'drizzle-orm'
import { useDb, schema, now, resolvePublicOrgId, isUniqueConstraintError } from '../../utils/db'
import { getOrSetVisitorId } from '../../utils/visitor'

/**
 * Real per-visitor favorite state (the `favorites` table, migration 0055),
 * not a raw counter any script could drive arbitrarily by replaying
 * { id, on: true/false } — favoriteCount only moves when THIS visitor's own
 * membership in `favorites` actually changes, at most ±1 per visitor
 * (docs/production-hardening-audit.md, P1-7). The frontend's per-visitor UI
 * state (composables/useFavorites.ts, localStorage) is unaffected — this
 * only changes what the server trusts, not the request shape.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ id?: number; on?: boolean }>(event)
  const id = Number(body?.id)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const db = useDb(event)
  const orgId = resolvePublicOrgId(event)
  const visitorId = getOrSetVisitorId(event)

  // Scoped to this hostname's tenant: without it, anyone could target
  // another agency's listing by posting its id.
  const property = (
    await db
      .select({ id: schema.developerProperties.id })
      .from(schema.developerProperties)
      .where(and(eq(schema.developerProperties.id, id), eq(schema.developerProperties.organizationId, orgId)))
      .limit(1)
  )[0]
  if (!property) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  if (body?.on) {
    try {
      await db.insert(schema.favorites).values({ organizationId: orgId, developerPropertyId: id, visitorId, createdAt: now() })
    } catch (e: any) {
      if (isUniqueConstraintError(e)) return { ok: true } // already favorited by this visitor — idempotent no-op
      throw e
    }
    await db
      .update(schema.developerProperties)
      .set({ favoriteCount: sql`${schema.developerProperties.favoriteCount} + 1` })
      .where(eq(schema.developerProperties.id, id))
  } else {
    const deleted = await db
      .delete(schema.favorites)
      .where(and(eq(schema.favorites.developerPropertyId, id), eq(schema.favorites.visitorId, visitorId)))
      .returning({ id: schema.favorites.id })
    if (deleted.length) {
      await db
        .update(schema.developerProperties)
        .set({ favoriteCount: sql`max(0, ${schema.developerProperties.favoriteCount} - 1)` })
        .where(eq(schema.developerProperties.id, id))
    }
  }

  return { ok: true }
})
