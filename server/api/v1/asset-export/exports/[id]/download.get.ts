import { eq } from 'drizzle-orm'
import { useDb, schema, cfEnv } from '../../../../../utils/db'
import { requireApiKey } from '../../../../../utils/apiAuth'
import { rateLimit } from '../../../../../utils/rateLimit'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireApiKey(event, 'read')
  await rateLimit(event, 'public-api', { limit: 120, windowSeconds: 60 })

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const render = (await db.select().from(schema.assetExportRenders).where(eq(schema.assetExportRenders.id, id)).limit(1))[0]
  if (!render || render.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Export not found' })
  if (render.status !== 'completed' || !render.r2Key) throw createError({ statusCode: 409, statusMessage: `Export is ${render.status}, not ready for download` })

  const obj = await cfEnv(event).MEDIA.get(render.r2Key)
  if (!obj) throw createError({ statusCode: 404, statusMessage: 'File missing from storage' })

  setHeader(event, 'Content-Type', obj.httpMetadata?.contentType || 'application/octet-stream')
  setHeader(event, 'Content-Disposition', `attachment; filename="export-${render.projectId}-${render.id}.pdf"`)
  return obj.body
})
