import { eq } from 'drizzle-orm'
import { useDb, schema } from '../../../../utils/db'
import { requireApiKey } from '../../../../utils/apiAuth'
import { rateLimit } from '../../../../utils/rateLimit'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireApiKey(event, 'read')
  await rateLimit(event, 'public-api', { limit: 120, windowSeconds: 60 })

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const render = (await db.select().from(schema.assetExportRenders).where(eq(schema.assetExportRenders.id, id)).limit(1))[0]
  if (!render || render.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Export not found' })

  return {
    id: render.id,
    projectId: render.projectId,
    status: render.status,
    formatKey: render.formatKey,
    fileSizeBytes: render.fileSizeBytes,
    errorMessage: render.errorMessage,
    downloadUrl: render.status === 'completed' ? `/api/v1/asset-export/exports/${render.id}/download` : null,
    createdAt: render.createdAt,
    completedAt: render.completedAt,
  }
})
