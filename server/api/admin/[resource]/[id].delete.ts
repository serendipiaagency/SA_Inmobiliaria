import { and, eq, sql } from 'drizzle-orm'
import { useDb, schema, cfEnv, now } from '../../../utils/db'
import { requireOrgScope, requireSuperAdmin, type SessionUser } from '../../../utils/auth'
import { getResource } from '../../../utils/adminResources'
import { logAdminAction } from '../../../utils/audit'
import { authorizeRecord, buildTenantWhere } from '../../../utils/tenantPolicy'
import { softDeleteMediaAssetByKey } from '../../../utils/mediaAssets'
import { assertOwnsSavedView } from '../../../utils/properties/savedViews'
import { deletePropertySheet, propertyKindForResource } from '../../../utils/properties/extendedSheet'
import { collectPropertyFileKeys, releaseMediaKeyIfUnreferenced, releasePropertyFiles, trashPropertyMediaFile } from '../../../utils/properties/media'
import { purgeDocumentFile, purgePropertyDocuments, trashDocumentFile } from '../../../utils/properties/documents'
import { deleteCustomFieldValues, isCustomFieldValueResource } from '../../../utils/customFields/service'
import { assertTagLinkScope, deleteEntityTagLinks } from '../../../utils/tags/service'

/** Hijas de una propiedad cuya fila guarda una imagen en `image` (fotos de galería y planos). */
const IMAGE_CHILD_RESOURCES = new Set(['project-images', 'gallery-images', 'floor-plans', 'agent-property-floor-plans'])

// visitor_submissions rows reference R2 keys for identity/financial PDFs. The DB row being
// gone must mean the documents are gone too — otherwise "deleting" someone's passport scan
// from the admin only hides it from the UI while it lingers in R2 indefinitely.
const VISITOR_DOC_FIELDS = [
  'passportPdf',
  'emiratesIdPdf',
  'bankStatementPdf',
  'tradeLicensePdf',
  'vatRegistrationCertificatePdf',
  'etihadCreditBureauPdf',
] as const

export default defineEventHandler(async (event) => {
  const { key, def } = getResource(event)
  let orgId: number | null = null
  let user: SessionUser
  if (def.superAdminOnly) {
    user = await requireSuperAdmin(event)
  } else {
    ;({ user, orgId } = await requireOrgScope(event, def.area, 'write'))
  }
  // La traza de Domain Tools es auditoría: nadie la borra desde el panel.
  if (key === 'domain-tools') throw createError({ statusCode: 405, statusMessage: 'La traza de Domain Tools no se puede borrar' })
  // Un lead no se borra: se marca como perdido (con su motivo), y así su historia sigue contando.
  if (key === 'leads') throw createError({ statusCode: 405, statusMessage: 'Los leads no se borran: márcalo como perdido con su motivo' })
  // Un valor de campo personalizado se vacía desde el panel de la ficha (POST con el campo vacío).
  if (isCustomFieldValueResource(key)) throw createError({ statusCode: 405, statusMessage: 'Para quitar un valor, vacía el campo en la ficha' })
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  if (key === 'users' && id === user.id) {
    throw createError({ statusCode: 422, statusMessage: 'You cannot delete your own account' })
  }
  const db = useDb(event)

  // Ownership first: a delete against another tenant's id must 404 before it
  // touches R2 or any counter, not merely match zero rows on the way out.
  const { row } = await authorizeRecord(db, { resourceKey: key, table: def.table, policy: def.tenantPolicy, id, orgId })

  if (key === 'property-saved-views') assertOwnsSavedView(row as any, user.id)
  // Quitar una etiqueta: sólo desde el recurso del área de esa entidad.
  assertTagLinkScope(key, row)

  const tenantWhere = buildTenantWhere(db, def.table, def.tenantPolicy, orgId)
  const idCond = eq(def.table.id, id)
  const where = tenantWhere ? and(idCond, tenantWhere) : idCond

  if (key === 'visitor-submissions') {
    const record = row as Record<string, string | null>
    const keys = VISITOR_DOC_FIELDS.map((f) => record[f]).filter((v): v is string => !!v)
    if (keys.length) {
      const bucket = cfEnv(event).MEDIA
      await Promise.all(
        keys.map(async (k) => {
          await bucket.delete(k)
          // The R2 object is gone for real right now — reflect that in the
          // tracked asset immediately, same as the catalog fragment cleanup.
          await softDeleteMediaAssetByKey(db, k).catch(() => null)
        }),
      )
    }
  }

  if (key === 'cms-comments' && row.status === 'approved') {
    await db
      .update(schema.cmsArticles)
      .set({ commentCount: sql`max(${schema.cmsArticles.commentCount} - 1, 0)` })
      .where(and(eq(schema.cmsArticles.id, row.articleId), eq(schema.cmsArticles.organizationId, orgId!)))
  }

  // Soft-delete resources move to Papelera by default; ?hard=1 (used from
  // within Papelera itself) purges the row for real.
  const hard = String(getQuery(event).hard || '') === '1'
  const propertyKind = propertyKindForResource(key)
  // Borrado definitivo de una propiedad: sus ficheros (fotos, planos,
  // multimedia) se recogen ANTES de que la cascada se lleve las filas.
  const propertyFileKeys = propertyKind && hard ? await collectPropertyFileKeys(db, orgId!, propertyKind, id) : []
  try {
    if (def.softDelete && !hard) {
      await db.update(def.table).set({ deletedAt: now() }).where(where as any)
    } else {
      await db.delete(def.table).where(where as any)
      // La ficha ampliada (tablas 1:1 sin FK real, migración 0086) se va con la propiedad.
      if (propertyKind) {
        await deletePropertySheet(db, orgId!, propertyKind, id)
        // Y sus etiquetas y valores de campos personalizados (tablas polimórficas, sin FK).
        await deleteEntityTagLinks(db, orgId!, propertyKind, id)
        await deleteCustomFieldValues(db, orgId!, { ref: { entityType: 'property', entityKind: propertyKind, entityId: id } })
      }
      // Eliminar definitivamente un campo personalizado se lleva sus valores.
      if (key === 'custom-fields') await deleteCustomFieldValues(db, orgId!, { definitionId: id })
    }
  } catch (err: any) {
    // A hard delete can hit a real FK reference (e.g. a category still used by an
    // article). Surface that as an honest, actionable error instead of a raw 500.
    const msg = String(err?.cause?.message || err?.message || '')
    if (msg.includes('FOREIGN KEY constraint failed')) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Este registro todavía está en uso por otros datos (por ejemplo, artículos u otros elementos que lo referencian). Reasígnalos o elimínalos primero.',
      })
    }
    throw err
  }
  // Multimedia y documentos (FASES 6-7): nada se queda huérfano en R2 ni en
  // media_assets. Una foto o un plano se borran de verdad (no tienen
  // papelera): su fichero se libera si nadie más de la agencia lo usa. Un
  // documento o un recurso a la papelera deja de servirse; borrado
  // definitivamente, se va también su fichero.
  const deleted = row as Record<string, any>
  if (IMAGE_CHILD_RESOURCES.has(key)) await releaseMediaKeyIfUnreferenced(db, orgId!, deleted.image)
  if (key === 'property-media') {
    if (hard) await releaseMediaKeyIfUnreferenced(db, orgId!, deleted.r2Key)
    else await trashPropertyMediaFile(db, orgId!, { id, r2Key: deleted.r2Key })
  }
  if (key === 'property-documents') {
    if (hard) await purgeDocumentFile(db, cfEnv(event).MEDIA, orgId!, deleted)
    else await trashDocumentFile(db, orgId!, deleted)
  }
  if (propertyKind && hard) {
    await releasePropertyFiles(db, orgId!, propertyKind, id, propertyFileKeys)
    await purgePropertyDocuments(db, cfEnv(event).MEDIA, orgId!, propertyKind, id)
  }
  await logAdminAction(event, { user, orgId, action: 'delete', resource: key, resourceId: id, detail: hard ? 'hard' : 'soft' })
  return { ok: true }
})
