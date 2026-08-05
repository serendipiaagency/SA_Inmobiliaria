import { requireOrgScope } from '../../../utils/auth'
import { useDb, schema, now } from '../../../utils/db'
import { logAdminAction } from '../../../utils/audit'

const VALID_TYPES = ['reserva', 'arras', 'alquiler', 'compraventa'] as const

interface Body {
  name?: string
  type?: string
  bodyTemplate?: string
}

export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<Body>(event)
  if (!body?.name?.trim()) throw createError({ statusCode: 422, statusMessage: 'name is required' })
  if (!body?.bodyTemplate?.trim()) throw createError({ statusCode: 422, statusMessage: 'bodyTemplate is required' })
  const type = VALID_TYPES.includes(body.type as any) ? body.type! : 'reserva'

  const db = useDb(event)
  const nowTs = now()
  const [template] = await db
    .insert(schema.contractTemplates)
    .values({ organizationId: orgId, name: body.name.trim(), type, bodyTemplate: body.bodyTemplate.trim(), createdAt: nowTs, updatedAt: nowTs })
    .returning()

  await logAdminAction(event, { user, orgId, action: 'create', resource: 'contract_template', resourceId: template.id })
  return template
})
