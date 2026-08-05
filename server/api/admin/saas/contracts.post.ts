import { eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../utils/auth'
import { useDb, schema, now } from '../../../utils/db'
import { logAdminAction } from '../../../utils/audit'
import { resolveContractBindings, applyBindings } from '../../../utils/contracts/bindings'

interface Body {
  templateId?: number
  title?: string
  clientName?: string
  clientEmail?: string
  assetKind?: string
  assetId?: number
  variables?: Record<string, string>
}

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<Body>(event)
  if (!body?.templateId) throw createError({ statusCode: 422, statusMessage: 'templateId is required' })
  if (!body?.title?.trim()) throw createError({ statusCode: 422, statusMessage: 'title is required' })
  if (!body?.clientName?.trim()) throw createError({ statusCode: 422, statusMessage: 'clientName is required' })

  const db = useDb(event)
  const template = (await db.select().from(schema.contractTemplates).where(eq(schema.contractTemplates.id, body.templateId)).limit(1))[0]
  if (!template || template.organizationId !== orgId) throw createError({ statusCode: 404, statusMessage: 'Template not found' })

  const bindings = await resolveContractBindings(event, orgId, {
    clientName: body.clientName.trim(),
    clientEmail: body.clientEmail || null,
    assetKind: body.assetKind || null,
    assetId: body.assetId || null,
    variables: body.variables || {},
  })
  const bodyText = applyBindings(template.bodyTemplate, bindings)

  const nowTs = now()
  const [contract] = await db
    .insert(schema.contracts)
    .values({
      organizationId: orgId,
      templateId: template.id,
      title: body.title.trim(),
      assetKind: body.assetKind || null,
      assetId: body.assetId || null,
      clientName: body.clientName.trim(),
      clientEmail: body.clientEmail || null,
      bodyText,
      status: 'draft',
      createdBy: user.id,
      createdAt: nowTs,
      updatedAt: nowTs,
    })
    .returning()

  await logAdminAction(event, { user, orgId, action: 'create', resource: 'contract', resourceId: contract.id })
  return contract
})
