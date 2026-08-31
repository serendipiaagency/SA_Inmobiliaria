import { requireOrgScope } from '../../../../../utils/auth'
import { useDb, cfEnv } from '../../../../../utils/db'
import { findOwnedPendingUpload, uploadMultipartPart, abortMultipartUpload } from '../../../../../utils/mediaMultipart'

/** Step 2 of 3: uploads one raw-binary chunk (?partNumber=N). See server/utils/mediaMultipart.ts. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const uploadId = getRouterParam(event, 'uploadId')
  if (!uploadId) throw createError({ statusCode: 400, statusMessage: 'uploadId requerido' })
  const partNumber = Number(getQuery(event).partNumber)

  const db = useDb(event)
  const bucket = cfEnv(event).MEDIA
  const row = await findOwnedPendingUpload(db, orgId, uploadId)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Subida no encontrada' })

  const bytes = await readRawBody(event, false)
  if (!bytes) throw createError({ statusCode: 422, statusMessage: 'Parte vacía' })

  try {
    return await uploadMultipartPart(bucket, row, partNumber, bytes)
  } catch (err: any) {
    if (err?.statusCode === 415) {
      // Malformed content on the very first part — no point letting the client keep sending the rest of the file.
      await abortMultipartUpload(db, bucket, row)
    }
    throw err
  }
})
