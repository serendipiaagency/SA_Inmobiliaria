import { useDb } from '../../../utils/db'
import { requireOrgScope } from '../../../utils/auth'
import { getResource } from '../../../utils/adminResources'
import { storeAndRegisterFile } from '../../../utils/media'

/**
 * Uploads for resources whose files must never be publicly readable — unlike
 * upload.post.ts (always `visibility: 'public'`, meant for catalog media
 * that ends up on the published site), this registers the file `private`:
 * serving it back through /api/media/[...key] then requires an admin
 * session AND matching organizationId (server/api/media/[...key].get.ts),
 * same as contracts/KYC documents elsewhere. Only implemented for
 * team-member-documents today — every other resource 404s, same pattern as
 * duplicate.post.ts.
 */
export default defineEventHandler(async (event) => {
  const { key, def } = getResource(event)
  if (key !== 'team-member-documents') throw createError({ statusCode: 404, statusMessage: 'Private upload is not supported for this resource' })

  const { user, orgId } = await requireOrgScope(event, def.area, 'write')
  const parts = await readMultipartFormData(event)
  const file = parts?.find((p) => p.name === 'file' && p.data?.byteLength)
  if (!file) throw createError({ statusCode: 422, statusMessage: 'No file provided' })

  const db = useDb(event)
  const stored = await storeAndRegisterFile(event, db, file, {
    organizationId: orgId,
    visibility: 'private',
    category: 'team-member-document',
    entityType: key,
    createdBy: user.id,
  })
  return { key: stored.key }
})
