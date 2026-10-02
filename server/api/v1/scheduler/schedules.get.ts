import { and, desc, eq } from 'drizzle-orm'
import { useDb, schema } from '../../../utils/db'
import { requireApiKey } from '../../../utils/apiAuth'
import { rateLimit } from '../../../utils/rateLimit'
import { livePropertyCond } from '../../../utils/properties/trash'

/**
 * GET /api/v1/scheduler/schedules — Fase 16 (public API). Requires
 * `Authorization: Bearer <api key>` with the "read" scope (mint one at
 * /admin/api). Read-only: this API never accepts writes.
 */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireApiKey(event, 'read')
  await rateLimit(event, 'public-api', { limit: 120, windowSeconds: 60 })

  const db = useDb(event)
  const rows = await db
    .select({
      id: schema.publicationSchedules.id,
      developerPropertyId: schema.publicationSchedules.developerPropertyId,
      propertySlug: schema.developerProperties.slug,
      name: schema.publicationSchedules.name,
      baseScheduledAt: schema.publicationSchedules.baseScheduledAt,
      status: schema.publicationSchedules.status,
      createdAt: schema.publicationSchedules.createdAt,
    })
    .from(schema.publicationSchedules)
    .leftJoin(schema.developerProperties, eq(schema.developerProperties.id, schema.publicationSchedules.developerPropertyId))
    // API v1: las programaciones de una propiedad en la papelera no se listan
    // (la API no ve la papelera; el panel sí, como historia).
    .where(and(eq(schema.publicationSchedules.organizationId, orgId), livePropertyCond(schema.developerProperties)))
    .orderBy(desc(schema.publicationSchedules.baseScheduledAt))
    .limit(200)

  return { data: rows }
})
