import { requireOrgScope } from '../../../../../utils/auth'
import { useDb, cfEnv } from '../../../../../utils/db'
import { findOwnedPendingUpload, completeMultipartUpload } from '../../../../../utils/mediaMultipart'
import { mediaUrl } from '../../../../../utils/media'

/** Step 3 of 3: assembles the parts and registers the resulting media_assets row. See server/utils/mediaMultipart.ts. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const uploadId = getRouterParam(event, 'uploadId')
  if (!uploadId) throw createError({ statusCode: 400, statusMessage: 'uploadId requerido' })
  const body = await readBody<{ parts?: { partNumber: number; etag: string }[] }>(event)

  const db = useDb(event)
  const bucket = cfEnv(event).MEDIA
  const row = await findOwnedPendingUpload(db, orgId, uploadId)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Subida no encontrada' })

  const result = await completeMultipartUpload(db, bucket, row, body?.parts || [])
  return { key: result.key, url: mediaUrl(result.key) }
})
