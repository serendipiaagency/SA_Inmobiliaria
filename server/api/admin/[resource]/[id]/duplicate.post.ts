import { eq } from 'drizzle-orm'
import { schema, now, slugify, useDb } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'
import { getResource, generateReferenceCode } from '../../../../utils/adminResources'
import { authorizeRecord } from '../../../../utils/tenantPolicy'
import { logAdminAction } from '../../../../utils/audit'
import { loadPropertySheet, savePropertySheet } from '../../../../utils/properties/extendedSheet'
import { PROPERTY_SHEET_FIELDS } from '../../../../../utils/propertySheet'
import { isPropertyTrashed, trashedPropertyMessage } from '../../../../utils/properties/trash'

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
  // Duplicar es crear una propiedad nueva a partir de esta: desde la papelera, no.
  if (isPropertyTrashed(original as { deletedAt?: string | null })) throw createError({ statusCode: 422, statusMessage: trashedPropertyMessage('duplicarla') })

  const clone = { ...original } as Record<string, any>
  delete clone.id
  clone.name = `${original.name} (copia)`
  clone.slug = `${slugify(String(original.name))}-copia-${Math.floor(Math.random() * 10000)}`
  // La referencia interna es única por organización (migración 0068) — una
  // copia con la misma referencia que el original violaría ese índice.
  clone.reference = `W-${generateReferenceCode()}`
  clone.status = 'new'
  clone.publishedAt = null
  clone.isExclusive = 0
  clone.isReserved = 0
  clone.viewCount = 0
  clone.favoriteCount = 0
  clone.createdAt = now()
  clone.updatedAt = now()
  clone.createdBy = user.id
  clone.deletedAt = null

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
    await db.insert(schema.images).values(
      galleryRows.map((r) => ({
        developerPropertyId: newId,
        image: r.image,
        sortOrder: r.sortOrder,
        title: r.title,
        alt: r.alt,
        caption: r.caption,
        language: r.language,
        isPublishable: r.isPublishable,
        isPrivate: r.isPrivate,
        isHidden: r.isHidden,
        createdAt: now(),
      })),
    )
  }
  // La ficha ampliada (migración 0086) también se copia; el código comercial
  // no, igual que la referencia: identifica un anuncio concreto. Tampoco el
  // estado comercial (cierre D1p): la copia nace sin publicar y sin reservar
  // (arriba), y una copia «Vendida» o «Reservada» sería falsa.
  const sheet = await loadPropertySheet(db, orgId, 'developer', id)
  sheet.commercialCode = null
  sheet.commercialStatus = null
  const payload = { details: {} as Record<string, unknown>, legal: {} as Record<string, unknown> }
  for (const f of PROPERTY_SHEET_FIELDS) if (sheet[f.key] != null) (f.store === 'details' ? payload.details : payload.legal)[f.key] = sheet[f.key]
  await savePropertySheet(db, orgId, 'developer', newId, payload, user.id)
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
