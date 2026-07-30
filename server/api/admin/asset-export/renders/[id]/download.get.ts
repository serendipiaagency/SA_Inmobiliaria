import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../utils/auth'
import { useDb, schema, cfEnv } from '../../../../../utils/db'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const render = (await db.select().from(schema.assetExportRenders).where(eq(schema.assetExportRenders.id, id)).limit(1))[0]
  if (!render || render.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Render not found' })
  if (render.status !== 'completed' || !render.r2Key) throw createError({ statusCode: 409, statusMessage: `Render is ${render.status}, not ready for download` })

  const obj = await cfEnv(event).MEDIA.get(render.r2Key)
  if (!obj) throw createError({ statusCode: 404, statusMessage: 'File missing from storage' })

  setHeader(event, 'Content-Type', obj.httpMetadata?.contentType || 'application/octet-stream')
  setHeader(event, 'Content-Disposition', `attachment; filename="export-${render.projectId}-${render.id}.pdf"`)
  return obj.body
})
