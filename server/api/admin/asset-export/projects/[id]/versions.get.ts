import { desc, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../utils/auth'
import { useDb, schema } from '../../../../../utils/db'

export default defineEventHandler(async (event) => {
  const { orgId } = await requireOrgScope(event)
  const projectId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(projectId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const project = (
    await db.select({ id: schema.assetExportProjects.id, organizationId: schema.assetExportProjects.organizationId }).from(schema.assetExportProjects).where(eq(schema.assetExportProjects.id, projectId)).limit(1)
  )[0]
  if (!project || project.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  return db
    .select({
      id: schema.assetExportProjectVersions.id,
      status: schema.assetExportProjectVersions.status,
      editedBy: schema.assetExportProjectVersions.editedBy,
      createdAt: schema.assetExportProjectVersions.createdAt,
    })
    .from(schema.assetExportProjectVersions)
    .where(eq(schema.assetExportProjectVersions.projectId, projectId))
    .orderBy(desc(schema.assetExportProjectVersions.createdAt))
    .limit(50)
})
