import { useDb } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'
import { getResource } from '../../../utils/adminResources'
import { storeAndRegisterFile } from '../../../utils/media'
import { createPropertyDocumentFromUpload } from '../../../utils/properties/documents'

/**
 * Uploads for resources whose files must never be publicly readable — unlike
 * upload.post.ts (always `visibility: 'public'`, meant for catalog media
 * that ends up on the published site), this registers the file `private`:
 * serving it back through /api/media/[...key] then requires an admin
 * session AND matching organizationId (server/api/media/[...key].get.ts),
 * same as contracts/KYC documents elsewhere. Implemented for
 * team-member-documents and, desde el bloque N7a, property-documents —
 * every other resource 404s, same pattern as duplicate.post.ts.
 *
 * property-documents (FASE 6): una sola petición multipart lleva el fichero
 * Y los metadatos del documento (propertyKind, propertyId, docType, title,
 * visibility, issuedAt, expiresAt, notes). Todo se valida antes de escribir
 * en R2, el fichero se registra `confidential` y la fila del documento se
 * crea en la misma llamada — ver server/utils/properties/documents.ts.
 */
export default defineEventHandler(async (event) => {
  const { key, def } = getResource(event)
  if (key !== 'team-member-documents' && key !== 'property-documents') throw createError({ statusCode: 404, statusMessage: 'Private upload is not supported for this resource' })

  const { user, orgId } = await requireOrgScope(event, def.area, 'write')
  const parts = await readMultipartFormData(event)
  const db = useDb(event)

  if (key === 'property-documents') return createPropertyDocumentFromUpload(event, db, orgId, user, (parts || []) as any[])

  const file = parts?.find((p) => p.name === 'file' && p.data?.byteLength)
  if (!file) throw createError({ statusCode: 422, statusMessage: 'No file provided' })

  const stored = await storeAndRegisterFile(event, db, file, {
    organizationId: orgId,
    visibility: 'private',
    category: 'team-member-document',
    entityType: key,
    createdBy: user.id,
  })
  return { key: stored.key }
})
