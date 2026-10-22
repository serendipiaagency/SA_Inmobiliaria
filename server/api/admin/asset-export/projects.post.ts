import { and, eq, isNull, or } from 'drizzle-orm'
import { requireOrgScope } from '../../../utils/auth'
import { useDb, schema, now } from '../../../utils/db'
import { logAdminAction } from '../../../utils/audit'
import { trashedPropertyMessage } from '../../../utils/properties/trash'

interface CreateProjectBody {
  templateId?: number
  assetKind?: string
  assetId?: number
  name?: string
}

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<CreateProjectBody>(event)

  if (!body?.templateId || !body.assetKind || !body.assetId) {
    throw createError({ statusCode: 422, statusMessage: 'templateId, assetKind and assetId are required' })
  }
  // Obra nueva y 2ª mano: el resolver de bindings y el renderer ya soportan
  // ambas (la pieza se genera desde «Dossier y creatividades» en los dos
  // catálogos). Cualquier otro origen no está soportado.
  if (body.assetKind !== 'developer_property' && body.assetKind !== 'agent_property') {
    throw createError({ statusCode: 422, statusMessage: `Unsupported assetKind: ${body.assetKind}` })
  }

  const db = useDb(event)
  const template = (
    await db
      .select()
      .from(schema.assetExportTemplates)
      .where(or(isNull(schema.assetExportTemplates.organizationId), eq(schema.assetExportTemplates.organizationId, orgId)))
      .limit(500)
  ).find((t) => t.id === body.templateId)
  if (!template) throw createError({ statusCode: 404, statusMessage: 'Template not found' })

  // La propiedad se carga de su catálogo (sólo id/precio/estado para el
  // snapshot y el control de papelera); la resolución real de los datos la hace
  // el render vía resolveAssetBindings. Obra nueva tiene nombre propio; 2ª mano
  // no (su título se deriva), así que para el nombre por defecto se usa su id.
  let asset: { id: number; name: string | null; price: number | null; organizationId: number; deletedAt: string | null } | undefined
  if (body.assetKind === 'agent_property') {
    const row = (
      await db
        .select({ id: schema.agentProperties.id, price: schema.agentProperties.price, organizationId: schema.agentProperties.organizationId, deletedAt: schema.agentProperties.deletedAt })
        .from(schema.agentProperties)
        .where(and(eq(schema.agentProperties.id, body.assetId), eq(schema.agentProperties.organizationId, orgId)))
        .limit(1)
    )[0]
    asset = row && { ...row, name: `Inmueble #${row.id}` }
  } else {
    asset = (
      await db
        .select({ id: schema.developerProperties.id, name: schema.developerProperties.name, price: schema.developerProperties.price, organizationId: schema.developerProperties.organizationId, deletedAt: schema.developerProperties.deletedAt })
        .from(schema.developerProperties)
        .where(and(eq(schema.developerProperties.id, body.assetId), eq(schema.developerProperties.organizationId, orgId)))
        .limit(1)
    )[0]
  }
  if (!asset) throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
  // Una pieza nueva de una propiedad de la papelera, no.
  if (asset.deletedAt) throw createError({ statusCode: 422, statusMessage: trashedPropertyMessage('exportarla') })

  const nowTs = now()
  const inserted = await db
    .insert(schema.assetExportProjects)
    .values({
      organizationId: orgId,
      templateId: template.id,
      assetKind: body.assetKind,
      assetId: body.assetId,
      name: body.name?.trim() || `${template.name} — ${asset.name}`,
      formatKey: template.formatKey,
      structureJson: template.structureJson,
      priceAtCreation: asset.price,
      createdBy: user.id,
      createdAt: nowTs,
      updatedAt: nowTs,
    })
    .returning()

  await logAdminAction(event, { user, orgId, action: 'create', resource: 'asset-export-project', resourceId: inserted[0].id })
  return inserted[0]
})
