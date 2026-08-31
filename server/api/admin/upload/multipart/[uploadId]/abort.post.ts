import { requireOrgScope } from '../../../../../utils/auth'
import { useDb, cfEnv } from '../../../../../utils/db'
import { findOwnedPendingUpload, abortMultipartUpload } from '../../../../../utils/mediaMultipart'

/** Client-initiated cancel (upload error, user navigates away) — best-effort; the daily sweep is the real backstop. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const uploadId = getRouterParam(event, 'uploadId')
  if (!uploadId) throw createError({ statusCode: 400, statusMessage: 'uploadId requerido' })

  const db = useDb(event)
  const bucket = cfEnv(event).MEDIA
  const row = await findOwnedPendingUpload(db, orgId, uploadId)
  if (!row) return { ok: true } // already gone or not ours — idempotent, nothing to do

  await abortMultipartUpload(db, bucket, row)
  return { ok: true }
})
