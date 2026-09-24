import { and, eq } from 'drizzle-orm'
import { requireOrgScope } from '../../../../utils/auth'
import { logAdminAction } from '../../../../utils/audit'
import { useDb, schema, now } from '../../../../utils/db'
import { STRATEGIES } from '../../../../utils/leads/routing'

/** Crea o actualiza una regla de asignación. Con `id` actualiza; sin él, crea. */
export default defineEventHandler(async (event) => {
  const { user, orgId } = await requireOrgScope(event)
  const body = await readBody<any>(event)

  const name = String(body?.name || '').trim()
  if (!name) throw createError({ statusCode: 422, statusMessage: 'La regla necesita un nombre' })
  if (body?.strategy && !STRATEGIES.includes(body.strategy)) {
    throw createError({ statusCode: 422, statusMessage: 'Estrategia no reconocida' })
  }
  if (body?.strategy === 'specific' && !Number.isInteger(body?.targetCommercialId)) {
    throw createError({ statusCode: 422, statusMessage: 'Elige a qué comercial asigna esta regla' })
  }

  const db = useDb(event)
  const nowTs = now()
  const values = {
    name,
    priority: Number.isFinite(body?.priority) ? Number(body.priority) : 100,
    enabled: body?.enabled === false || body?.enabled === 0 ? 0 : 1,
    matchSource: body?.matchSource || null,
    matchPortal: body?.matchPortal || null,
    matchZone: body?.matchZone || null,
    matchPropertyType: body?.matchPropertyType || null,
    matchLanguage: body?.matchLanguage || null,
    strategy: body?.strategy || 'round_robin',
    targetCommercialId: body?.targetCommercialId ?? null,
    targetOffice: body?.targetOffice || null,
    respectWorkingHours: body?.respectWorkingHours ? 1 : 0,
    updatedAt: nowTs,
  }

  if (Number.isInteger(body?.id)) {
    await db
      .update(schema.leadRoutingRules)
      .set(values)
      .where(and(eq(schema.leadRoutingRules.id, body.id), eq(schema.leadRoutingRules.organizationId, orgId)))
    await logAdminAction(event, { user, orgId, action: 'update', resource: 'lead_routing_rule', resourceId: body.id, detail: name })
    return (
      await db
        .select()
        .from(schema.leadRoutingRules)
        .where(and(eq(schema.leadRoutingRules.id, body.id), eq(schema.leadRoutingRules.organizationId, orgId)))
        .limit(1)
    )[0]
  }

  const [rule] = await db
    .insert(schema.leadRoutingRules)
    .values({ organizationId: orgId, ...values, createdAt: nowTs })
    .returning()
  await logAdminAction(event, { user, orgId, action: 'create', resource: 'lead_routing_rule', resourceId: rule.id, detail: name })
  return rule
})
