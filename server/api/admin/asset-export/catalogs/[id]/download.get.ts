import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../utils/auth'
import { useDb, schema, cfEnv } from '../../../../../utils/db'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const catalog = (await db.select().from(schema.assetExportCatalogs).where(eq(schema.assetExportCatalogs.id, id)).limit(1))[0]
  if (!catalog || catalog.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Catalog not found' })
  if (!['completed', 'completed_with_errors'].includes(catalog.status) || !catalog.r2Key) {
    throw createError({ statusCode: 409, statusMessage: `Catalog is ${catalog.status}, not ready for download` })
  }

  const obj = await cfEnv(event).MEDIA.get(catalog.r2Key)
  if (!obj) throw createError({ statusCode: 404, statusMessage: 'File missing from storage' })

  setHeader(event, 'Content-Type', obj.httpMetadata?.contentType || 'application/octet-stream')
  setHeader(event, 'Content-Disposition', `attachment; filename="catalogo-${catalog.id}.pdf"`)
  return obj.body
})
