import { eq } from 'drizzle-orm'
import { schema, now, slugify, useDb } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { getResource } from '../../../../utils/adminResources'
import { authorizeRecord } from '../../../../utils/tenantPolicy'
import { logAdminAction } from '../../../../utils/audit'

/**
 * Clones an off-plan project — the main row plus its gallery and social
 * links, the two child collections an editable duplicate is actually useful
 * without (floor plans/unit types/master-plan associations are left
 * unduplicated; they're promoter-level catalog data more often shared
 * across listings than copied). The clone is unpublished and unexclusive/
 * unreserved so it never appears live before someone reviews it.
 *
 * Only implemented for developer-properties today — every other resource
 * 404s, same as restore.post.ts does for non-softDelete resources.
 */
export default defineEventHandler(async (event) => {
  const { key, def } = getResource(event)
  if (key !== 'developer-properties') throw createError({ statusCode: 404, statusMessage: 'Duplicate is not supported for this resource' })

  const { user, orgId } = await requireOrgScope(event, def.area, 'write')
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const db = useDb(event)

  const { row: original } = await authorizeRecord(db, { resourceKey: key, table: def.table, policy: def.tenantPolicy, id, orgId })

  const clone = { ...original } as Record<string, any>
  delete clone.id
  clone.name = `${original.name} (copia)`
  clone.slug = `${slugify(String(original.name))}-copia-${Math.floor(Math.random() * 10000)}`
  clone.status = 'new'
  clone.publishedAt = null
  clone.isExclusive = 0
  clone.isReserved = 0
  clone.viewCount = 0
  clone.favoriteCount = 0
  clone.createdAt = now()
  clone.updatedAt = now()

  const inserted = await db
    .insert(schema.developerProperties)
    .values(clone as typeof schema.developerProperties.$inferInsert)
    .returning({ id: schema.developerProperties.id })
  const newId = inserted[0]?.id

  const [galleryRows, socialRows] = await Promise.all([
    db.select().from(schema.images).where(eq(schema.images.developerPropertyId, id)),
    db.select().from(schema.propertySocialMedia).where(eq(schema.propertySocialMedia.developerPropertyId, id)),
  ])

  if (galleryRows.length) {
    await db.insert(schema.images).values(galleryRows.map((r) => ({ developerPropertyId: newId, image: r.image, sortOrder: r.sortOrder, createdAt: now() })))
  }
  if (socialRows.length) {
    await db.insert(schema.propertySocialMedia).values(
      socialRows.map((r) => ({
        developerPropertyId: newId,
        platform: r.platform,
        url: r.url,
        caption: r.caption,
        sortOrder: r.sortOrder,
        createdAt: now(),
      })),
    )
  }

  await logAdminAction(event, { user, orgId, action: 'create', resource: key, resourceId: newId })
  return { ok: true, id: newId }
})
