import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../../../../utils/auth'
import { useDb, schema, now } from '../../../../../../../utils/db'
import { logAdminAction } from '../../../../../../../utils/audit'

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const projectId = Number(getRouterParam(event, 'id'))
  const versionId = Number(getRouterParam(event, 'versionId'))
  if (!Number.isFinite(projectId) || !Number.isFinite(versionId)) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const db = useDb(event)
  const project = (await db.select().from(schema.assetExportProjects).where(eq(schema.assetExportProjects.id, projectId)).limit(1))[0]
  if (!project || project.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Project not found' })

  const version = (await db.select().from(schema.assetExportProjectVersions).where(eq(schema.assetExportProjectVersions.id, versionId)).limit(1))[0]
  if (!version || version.projectId !== projectId) throw createError({ statusCode: 404, statusMessage: 'Version not found' })

  const nowTs = now()
  await db.update(schema.assetExportProjects).set({ structureJson: version.structureJson, updatedAt: nowTs }).where(eq(schema.assetExportProjects.id, projectId))
  await db.insert(schema.assetExportProjectVersions).values({ projectId, structureJson: version.structureJson, status: project.status, editedBy: user.id, createdAt: nowTs })

  await logAdminAction(event, { user, orgId, action: 'restore', resource: 'asset-export-project', resourceId: projectId, detail: `from version ${versionId}` })
  return (await db.select().from(schema.assetExportProjects).where(eq(schema.assetExportProjects.id, projectId)).limit(1))[0]
})
