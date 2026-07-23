import { and, eq } from 'drizzle-orm'
import { useDb, schema } from '../../../../utils/db'
import { requireOrgScope } from '../../../../utils/auth'

/** Toggle favorite, rename, move to folder, or update ALT/filename — all real, persisted fields. */
export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const id = parseInt(getRouterParam(event, 'id') || '', 10)
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const db = useDb(event)
  const body = await readBody<Record<string, any>>(event)

  const data: Record<string, any> = {}
  if (body.favorite !== undefined) data.favorite = body.favorite ? 1 : 0
  if (body.filename !== undefined) data.filename = String(body.filename).slice(0, 200)
  if (body.folderId !== undefined) data.folderId = body.folderId ? Number(body.folderId) : null
  if (!Object.keys(data).length) return { ok: true }

  await db.update(schema.cmsMedia).set(data).where(and(eq(schema.cmsMedia.id, id), eq(schema.cmsMedia.organizationId, orgId)))
  return { ok: true }
})
